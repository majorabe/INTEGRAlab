/**
 * Fuente única de puertos/nodos para `/infra`.
 *
 * Confirmado contra docker-compose.yml (mapeo host:container):
 *   coordinador-nacional   3001:3000
 *   coordinador-provincial 3002:3000
 *   hospital-donante       3003:3000
 *   hospital-receptor      3004:3000
 *
 * El spec original mencionaba "auditor" en 3002; ese rol no existe como
 * servicio Docker. 3002 es coordinador-provincial.
 *
 * Endpoint de salud: GET /health (nativo del nodo). Incluye ledgerHeight
 * y tipHash; no se usa /dashboard/health para no acoplar este panel a la
 * proyección clínica.
 */

export interface InfraNode {
  id: string
  label: string
  url: string
  isOrderer?: boolean
}

export const ORDERER_ID = 'coordinador-nacional'
export const QUORUM_NODOS = 3
export const TOTAL_NODOS = 4

export const NODES: InfraNode[] = [
  { id: 'coordinador-nacional', label: 'Coordinador Nacional', url: 'http://localhost:3001', isOrderer: true },
  { id: 'coordinador-provincial', label: 'Coordinador Provincial', url: 'http://localhost:3002' },
  { id: 'hospital-donante', label: 'Hospital Donante', url: 'http://localhost:3003' },
  { id: 'hospital-receptor', label: 'Hospital Receptor', url: 'http://localhost:3004' },
]

export const HEALTH_PATH = '/health'
export const INTEGRITY_PATH = '/verify-integrity'
export const FETCH_TIMEOUT_MS = 5000
export const AUTO_REFRESH_MS = 5000
