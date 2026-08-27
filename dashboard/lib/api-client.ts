/**
 * API Client para INTEGRAlab Dashboard
 * Encapsula las llamadas a los endpoints de Fase 1 (read-only) y a los endpoints de escritura
 * existentes, con soporte para selector de rol.
 *
 * Regla dura: El cliente NUNCA maneja claves privadas. Todas las firmas se hacen en el nodo
 * backend mediante el endpoint /sign.
 */

import axios, { AxiosInstance } from 'axios'
import {
  RoleType,
  CaseResponse,
  TimelineResponse,
  TelemetryResponse,
  NodeHealth,
  SignPayload,
  SignResponse,
  TransactionPayload,
  TransactionResponse,
} from './types'

export class APIClient {
  private baseURL: string
  private axiosInstance: AxiosInstance
  private role: RoleType
  private roleUrls: Record<RoleType, string> = {
    'coordinador-nacional': 'http://localhost:3001',
    'coordinador-provincial': 'http://localhost:3002',
    'hospital-donante': 'http://localhost:3003',
    'hospital-receptor': 'http://localhost:3004',
    iot: 'http://localhost:3003', // IoT reads from hospital-donante
    auditor: 'http://localhost:3001', // Auditor reads from all, default to coordinador
  }

  constructor(role: RoleType = 'coordinador-nacional') {
    this.role = role
    this.baseURL = this.roleUrls[role]
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'x-actor': role, // Header para los endpoints que requieren access control
      },
    })
  }

  /**
   * Cambiar el rol activo y reconfigurar la URL base
   */
  setRole(role: RoleType) {
    this.role = role
    this.baseURL = this.roleUrls[role]
    this.axiosInstance.defaults.baseURL = this.baseURL
    this.axiosInstance.defaults.headers['x-actor'] = role
  }

  getCurrentRole(): RoleType {
    return this.role
  }

  // ==================== READ-ONLY ENDPOINTS (Fase 1) ====================

  /**
   * GET /dashboard/casos/:id
   * Obtener estado consolidado de un caso
   */
  async getCaseState(caseId: string): Promise<CaseResponse> {
    try {
      const response = await this.axiosInstance.get<CaseResponse>(`/dashboard/casos/${caseId}`)
      return response.data
    } catch (error) {
      throw this.handleError(error, `Failed to get case state for ${caseId}`)
    }
  }

  /**
   * GET /dashboard/casos/:id/timeline
   * Obtener timeline de eventos para un caso
   */
  async getCaseTimeline(caseId: string): Promise<TimelineResponse> {
    try {
      const response = await this.axiosInstance.get<TimelineResponse>(
        `/dashboard/casos/${caseId}/timeline`
      )
      return response.data
    } catch (error) {
      throw this.handleError(error, `Failed to get timeline for ${caseId}`)
    }
  }

  /**
   * GET /dashboard/casos/:id/telemetria
   * Obtener serie de telemetría para un caso
   */
  async getCaseTelemetry(caseId: string): Promise<TelemetryResponse> {
    try {
      const response = await this.axiosInstance.get<TelemetryResponse>(
        `/dashboard/casos/${caseId}/telemetria`
      )
      return response.data
    } catch (error) {
      throw this.handleError(error, `Failed to get telemetry for ${caseId}`)
    }
  }

  /**
   * GET /dashboard/health
   * Obtener salud del nodo
   */
  async getNodeHealth(): Promise<NodeHealth> {
    try {
      const response = await this.axiosInstance.get<NodeHealth>('/dashboard/health')
      return response.data
    } catch (error) {
      throw this.handleError(error, 'Failed to get node health')
    }
  }

  /**
   * GET /ledger
   * Obtener ledger completo (usado para auditoría si es necesario)
   * Requiere x-actor header
   */
  async getLedger(): Promise<any> {
    try {
      const response = await this.axiosInstance.get('/ledger')
      return response.data
    } catch (error) {
      throw this.handleError(error, 'Failed to get ledger')
    }
  }

  // ==================== WRITE ENDPOINTS (ya existentes) ====================

  /**
   * POST /sign
   * Pedir al nodo que firme un payload con su propia clave privada
   * NUNCA expone la clave privada, solo retorna la firma
   */
  async signPayload(payload: Record<string, any>): Promise<SignResponse> {
    try {
      const response = await this.axiosInstance.post<SignResponse>('/sign', {
        payload,
      })
      return response.data
    } catch (error) {
      throw this.handleError(error, 'Failed to sign payload')
    }
  }

  /**
   * POST /tx/:type
   * Enviar una transacción con firmas validadas
   */
  async submitTransaction(
    txType: string,
    payload: Record<string, any>,
    signatures: Array<{ actor: string; signature: string }>
  ): Promise<TransactionResponse> {
    try {
      const response = await this.axiosInstance.post<TransactionResponse>(`/tx/${txType}`, {
        payload,
        signatures,
      })
      return response.data
    } catch (error) {
      throw this.handleError(error, `Failed to submit transaction ${txType}`)
    }
  }

  /**
   * POST /compatibility/query
   * Consultar compatibilidad HLA (Fase 1 read-only)
   */
  async queryCompatibility(
    donorProfile: any,
    waitingList: any[]
  ): Promise<{
    ok: boolean
    compatibilityTimestamp: string
    rankedCandidates: any[]
  }> {
    try {
      const response = await this.axiosInstance.post('/compatibility/query', {
        donorProfile,
        waitingList,
      })
      return response.data
    } catch (error) {
      throw this.handleError(error, 'Failed to query compatibility')
    }
  }

  /**
   * POST /verify-integrity
   * Verificar integridad del ledger
   */
  async verifyLedgerIntegrity(): Promise<any> {
    try {
      const response = await this.axiosInstance.get('/verify-integrity')
      return response.data
    } catch (error) {
      throw this.handleError(error, 'Failed to verify ledger integrity')
    }
  }

  // ==================== Helper methods ====================

  private handleError(error: any, message: string): never {
    if (error.response?.data?.reason) {
      throw new Error(`${message}: ${error.response.data.reason}`)
    }
    if (error.message) {
      throw new Error(`${message}: ${error.message}`)
    }
    throw new Error(message)
  }

  /**
   * Flujo completo: sign + submit transaction
   * Usado por la mayoría de operaciones de escritura
   */
  async executeTransaction(
    txType: string,
    payload: Record<string, any>,
    actorsToSign: RoleType[] = [this.role]
  ): Promise<TransactionResponse> {
    try {
      // Obtener firma de cada actor
      const signatures: Array<{ actor: string; signature: string }> = []

      for (const actor of actorsToSign) {
        // Cambiar rol temporalmente para obtener su firma
        const originalRole = this.role
        this.setRole(actor)

        const signResponse = await this.signPayload(payload)
        signatures.push({
          actor: actor,
          signature: signResponse.signature,
        })

        // Restaurar rol original
        this.setRole(originalRole)
      }

      // Enviar transacción con todas las firmas
      return await this.submitTransaction(txType, payload, signatures)
    } catch (error) {
      throw this.handleError(error, `Failed to execute transaction ${txType}`)
    }
  }

  /**
   * Cambiar el baseURL del cliente (para consultas a múltiples nodos, ej. en auditoría)
   */
  setCustomURL(url: string) {
    this.baseURL = url
    this.axiosInstance.defaults.baseURL = url
  }

  /**
   * Resetear al URL por defecto del rol actual
   */
  resetURL() {
    this.setRole(this.role)
  }
}

// Singleton instance
let globalClient: APIClient | null = null

export function getAPIClient(role?: RoleType): APIClient {
  if (!globalClient) {
    globalClient = new APIClient(role)
  } else if (role) {
    globalClient.setRole(role)
  }
  return globalClient
}
