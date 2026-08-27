/**
 * Configuración de roles para el dashboard
 * Cada rol corresponde a una organización real con certificado X.509
 */

import { RoleConfig, RoleType } from './types'

export const ROLE_CONFIGS: Record<RoleType, RoleConfig> = {
  'coordinador-nacional': {
    id: 'coordinador-nacional',
    name: 'Coordinador Nacional',
    description: 'Gestiona lista de espera nacional, emite asignaciones',
    port: 3001,
    color: 'bg-blue-600',
    permissions: [
      'view-all-cases',
      'manage-waiting-list',
      'create-assignment',
      'endorse-transactions',
    ],
  },
  'coordinador-provincial': {
    id: 'coordinador-provincial',
    name: 'Coordinador Provincial',
    description: 'Aprueba transacciones a nivel provincial',
    port: 3002,
    color: 'bg-cyan-600',
    permissions: [
      'view-provincial-cases',
      'endorse-transactions',
      'view-waiting-list',
    ],
  },
  'hospital-donante': {
    id: 'hospital-donante',
    name: 'Hospital Donante',
    description: 'Registra donantes, endorsa asignaciones',
    port: 3003,
    color: 'bg-green-600',
    permissions: [
      'register-donor',
      'endorse-transactions',
      'manage-custody',
      'record-telemetry',
    ],
  },
  'hospital-receptor': {
    id: 'hospital-receptor',
    name: 'Hospital Receptor',
    description: 'Confirma recepción de órgano, monitorea isquemia',
    port: 3004,
    color: 'bg-purple-600',
    permissions: [
      'view-assigned-cases',
      'confirm-reception',
      'endorse-transactions',
      'view-telemetry',
    ],
  },
  iot: {
    id: 'iot',
    name: 'Dispositivo IoT',
    description: 'Vista de solo lectura: monitoreo de telemetría durante transporte',
    port: 3003,
    color: 'bg-orange-600',
    permissions: ['view-telemetry'],
  },
  auditor: {
    id: 'auditor',
    name: 'Auditor Externo',
    description: 'Vista de solo lectura: auditoría de toda la red',
    port: 3001,
    color: 'bg-red-600',
    permissions: [
      'view-all-cases',
      'view-all-nodes',
      'view-ledger-integrity',
      'export-audit-reports',
    ],
  },
}

/**
 * Obtener configuración de rol
 */
export function getRoleConfig(role: RoleType): RoleConfig {
  return ROLE_CONFIGS[role]
}

/**
 * Obtener lista de roles disponibles (excluir IoT de la selección principal,
 * ya que es una vista especial)
 */
export function getAvailableRoles(): RoleType[] {
  return ['coordinador-nacional', 'coordinador-provincial', 'hospital-donante', 'hospital-receptor', 'auditor']
}

/**
 * Verificar si un rol tiene permiso para hacer algo
 */
export function hasPermission(role: RoleType, permission: string): boolean {
  return ROLE_CONFIGS[role].permissions.includes(permission)
}

/**
 * Obtener URL del nodo para un rol
 */
export function getRoleNodeURL(role: RoleType): string {
  const port = ROLE_CONFIGS[role].port
  return `http://localhost:${port}`
}
