/**
 * Cliente HTTP de SOLO LECTURA.
 * Únicamente GET a la capa de proyección (`/dashboard/*`).
 * No llama /sign, /tx, /ledger, /internal ni /compatibility/query.
 */

import axios, { AxiosInstance } from 'axios'
import { CaseResponse, NodeHealth, RoleType, TelemetryResponse, TimelineResponse } from './types'
import { NODE_URLS, actorHeaderForRole } from './roles'

function throwReadError(error: unknown, context: string): never {
  const err = error as {
    message?: string
    response?: { status?: number; statusText?: string; data?: { reason?: string } }
  }
  const reason = err.response?.data?.reason
  const status = err.response?.status
  if (reason) throw new Error(`${context}: ${reason}`)
  if (status) throw new Error(`${context}: HTTP ${status} ${err.response?.statusText ?? ''}`.trim())
  throw new Error(`${context}: ${err.message || 'error de red'}`)
}

export class ReadClient {
  private axiosInstance: AxiosInstance
  private role: RoleType

  constructor(role: RoleType = 'coordinador-nacional') {
    this.role = role
    this.axiosInstance = axios.create({
      baseURL: NODE_URLS[role],
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'x-actor': actorHeaderForRole(role),
      },
    })
  }

  setRole(role: RoleType) {
    this.role = role
    this.axiosInstance.defaults.baseURL = NODE_URLS[role]
    this.axiosInstance.defaults.headers['x-actor'] = actorHeaderForRole(role)
  }

  getCurrentRole(): RoleType {
    return this.role
  }

  getBaseURL(): string {
    return NODE_URLS[this.role]
  }

  async getCaseState(caseId: string): Promise<CaseResponse> {
    try {
      const response = await this.axiosInstance.get<CaseResponse>(
        `/dashboard/casos/${encodeURIComponent(caseId)}`
      )
      return response.data
    } catch (error) {
      throwReadError(error, `No se pudo leer el caso ${caseId}`)
    }
  }

  async getCaseTimeline(caseId: string): Promise<TimelineResponse> {
    try {
      const response = await this.axiosInstance.get<TimelineResponse>(
        `/dashboard/casos/${encodeURIComponent(caseId)}/timeline`
      )
      return response.data
    } catch (error) {
      throwReadError(error, `No se pudo leer el timeline de ${caseId}`)
    }
  }

  async getCaseTelemetry(caseId: string): Promise<TelemetryResponse> {
    try {
      const response = await this.axiosInstance.get<TelemetryResponse>(
        `/dashboard/casos/${encodeURIComponent(caseId)}/telemetria`
      )
      return response.data
    } catch (error) {
      throwReadError(error, `No se pudo leer la telemetría de ${caseId}`)
    }
  }

  async getNodeHealth(): Promise<NodeHealth> {
    try {
      const response = await this.axiosInstance.get<NodeHealth>('/dashboard/health')
      return response.data
    } catch (error) {
      throwReadError(error, 'No se pudo leer /dashboard/health de este nodo')
    }
  }
}

let singleton: ReadClient | null = null

export function getReadClient(role?: RoleType): ReadClient {
  if (!singleton) {
    singleton = new ReadClient(role)
  } else if (role) {
    singleton.setRole(role)
  }
  return singleton
}
