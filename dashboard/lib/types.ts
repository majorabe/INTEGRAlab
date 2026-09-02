/**
 * TypeScript types for INTEGRAlab Dashboard
 * Basados en los endpoints de Fase 1
 */

export type RoleType = 'coordinador-nacional' | 'coordinador-provincial' | 'hospital-donante' | 'hospital-receptor' | 'iot'

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
  receptionInfo: {
    donorId: string
    recipientId: string | null
    hospital: string
    receivedAt: string
  } | null
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
  type: 'donor-registry' | 'waiting-list' | 'assignment' | 'custody' | 'reception'
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

export interface HlaLocusMatch {
  locus: 'A' | 'B' | 'DR' | string
  donor: string | null
  recipient: string | null
  match: boolean
}

export interface OverviewDonor {
  donorId: string
  bloodType: string | null
  hlaProfile: { A: string; B: string; DR: string } | null
  organType: string | null
  preservationMethod: string | null
  registeredAt: string
  assigned: boolean
  received?: boolean
}

export interface OverviewPatient {
  patientId: string
  bloodType: string | null
  hlaProfile: { A: string; B: string; DR: string } | null
  urgencyLevel: number | null
  addedToWaitingListAt: string
  status: 'en-espera' | 'asignado' | 'recibido' | string
  assignedDonorId?: string | null
}

export interface CustodySample {
  secuencia: number
  timestamp: string
  temperaturaC: number | null
  humedadPct: number | null
  fueraDeRango: boolean
  deviceId: string | null
}

export interface OverviewCustody {
  organId: string
  readings: number
  alertCount?: number
  deviceId?: string
  deviceActor?: string
  lastTimestamp?: string
  lastTempC?: number
  organo?: string
  samples?: CustodySample[]
}

export interface OverviewAssignment {
  donorId: string
  recipientId: string
  organ: string | null
  assignedAt: string
  compatibilityTimestamp: string | null
  hlaScore: number | null
  hash?: string
  donorBloodType: string | null
  recipientBloodType: string | null
  hlaLoci: HlaLocusMatch[]
  hlaMatches: number
  custody: OverviewCustody | null
  received?: boolean
  receivedAt?: string | null
}

export interface MatchCandidate {
  patientId: string
  bloodType: string | null
  hlaProfile: { A: string; B: string; DR: string } | null
  urgencyLevel: number | null
  hlaScore: number
  selected: boolean
}

export interface LedgerOverview {
  ok: boolean
  donors: OverviewDonor[]
  waitingList: OverviewPatient[]
  assignments: OverviewAssignment[]
  custody: OverviewCustody[]
  matchRanking?: MatchCandidate[]
  counts: {
    donors: number
    waiting: number
    waitingUnassigned: number
    assignments: number
    custodyReadings: number
    ledgerBlocks: number
  }
  demoPitch: {
    recognized: boolean
    donorId: string
    patientId: string
    script: string
  }
}

export interface IotHealth {
  ok: boolean
  service: string
  container: string
  deviceId: string
  organId: string
  phase: 'esperando-assignment' | 'escribiendo' | string
  lastSequence: number
  lastTempC: number | null
  lastError: string | null
  startedAt: string
}
export interface AppState {
  currentRole: RoleType
  nodeUrl: string
  selectedCaseId: string | null
  nodeHealth: NodeHealth | null
  isLoading: boolean
  error: string | null
}
