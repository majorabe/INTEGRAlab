/**
 * TypeScript types for INTEGRAlab Dashboard
 * Basados en los endpoints de Fase 1
 */

export type RoleType = 'coordinador-nacional' | 'coordinador-provincial' | 'hospital-donante' | 'hospital-receptor' | 'iot' | 'auditor'

export interface RoleConfig {
  id: RoleType
  name: string
  description: string
  port: number
  color: string
  permissions: string[]
}

// Respuesta de Fase 1: GET /dashboard/casos/:id
export interface CaseState {
  donorInfo: {
    donorId: string
    bloodType: string
    hlaProfile: { A: string; B: string; DR: string }
    organType: string
    preservationMethod: string
    registeredAt: string
  } | null
  recipientInfo: {
    patientId: string
    bloodType: string
    hlaProfile: { A: string; B: string; DR: string }
    urgencyLevel: number
    addedToWaitingListAt: string
  } | null
  assignmentInfo: {
    donorId: string
    recipientId: string
    organ: string
    hlaScore?: number
    assignedAt: string
    compatibilityTimestamp: string
  } | null
  custodyCheckpoints: Array<{
    timestamp: string
    sensorType: string
    value: number
    unit: string
    deviceId: string
  }>
  transactionCount: number
  lastUpdated: string
}

export interface CaseResponse {
  ok: boolean
  found: boolean
  caseId: string
  state: CaseState
  timeline: TimelineEvent[]
  telemetry: TelemetryReading[]
  summary: {
    transactionCount: number
    lastUpdated: string
    isClosed: boolean
  }
}

// Respuesta de Fase 1: GET /dashboard/casos/:id/timeline
export interface TimelineEvent {
  timestamp: string
  type: 'donor-registry' | 'waiting-list' | 'assignment' | 'custody'
  action: string
  actors: string[]
  actorCount: number
  hash: string
  fullHash: string
  payloadSummary: Record<string, any>
  signatureCount: number
}

export interface TimelineResponse {
  ok: boolean
  caseId: string
  timeline: TimelineEvent[]
  eventCount: number
}

// Respuesta de Fase 1: GET /dashboard/casos/:id/telemetria
// Uses the REAL IoT simulator schema from iot-simulator/simulate.js
export interface TelemetryReading {
  timestamp: string
  deviceId: string
  organo: string
  secuencia: number
  temperaturaC: number
  humedadPct: number
  gps: {
    lat: number
    lon: number
  }
  fueraDeRango: boolean
}

export interface TelemetryResponse {
  ok: boolean
  caseId: string
  telemetry: TelemetryReading[]
  readingCount: number
}

// Respuesta de Fase 1: GET /dashboard/health
export interface NodeHealth {
  org: string
  status: 'ok' | 'error'
  ledgerBlocks: number
  transactionsByType: Record<string, number>
  recentTransactions: Array<{
    timestamp: string
    type: string
    hash: string
  }>
  timestamp: string
}

// Payload para trasacciones de escritura (endpoints existentes)
export interface SignPayload {
  payload: Record<string, any>
}

export interface SignResponse {
  ok: boolean
  actor: string
  signature: string
}

export interface TransactionPayload {
  payload: Record<string, any>
  signatures: Array<{
    actor: string
    signature: string
  }>
}

export interface TransactionResponse {
  ok: boolean
  reason?: string
  block?: {
    index: number
    timestamp: string
    txType: string
    payload: Record<string, any>
    hash: string
  }
  replication?: Array<{
    peer: string
    ok: boolean
  }>
}

// Tipos para la UI
export interface DonorRegistryForm {
  donorId: string
  bloodType: 'O+' | 'O-' | 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-'
  hlaProfile: {
    A: string
    B: string
    DR: string
  }
  organType: 'kidney' | 'liver' | 'heart' | 'lung'
  preservationMethod: 'static-cold' | 'dynamic-warm' | 'machine-perfusion'
}

export interface WaitingListEntryForm {
  patientId: string
  bloodType: 'O+' | 'O-' | 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-'
  hlaProfile: {
    A: string
    B: string
    DR: string
  }
  urgencyLevel: number // 1-5
}

export interface AssignmentForm {
  donorId: string
  recipientId: string
  organ: string
  compatibilityTimestamp: string
  hlaScore?: number
}

// Estado de la aplicación
export interface AppState {
  currentRole: RoleType
  nodeUrl: string
  selectedCaseId: string | null
  nodeHealth: NodeHealth | null
  isLoading: boolean
  error: string | null
}
