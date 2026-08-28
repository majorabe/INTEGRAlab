/**
 * Roles del dashboard clínico = organizaciones reales (MSP).
 * El selector elige DESDE QUÉ NODO se lee la proyección. No firma ni escribe.
 */

import { RoleConfig, RoleType } from './types'

export const NODE_URLS: Record<RoleType, string> = {
  'coordinador-nacional': 'http://localhost:3001',
  'coordinador-provincial': 'http://localhost:3002',
  'hospital-donante': 'http://localhost:3003',
  'hospital-receptor': 'http://localhost:3004',
  iot: 'http://localhost:3003',
}

export const ROLE_CONFIGS: Record<RoleType, RoleConfig> = {
  'coordinador-nacional': {
    id: 'coordinador-nacional',
    name: 'Coordinador Nacional',
    description: 'Lectura del caso completo y timeline',
    port: 3001,
    color: 'bg-teal-800',
    permissions: ['view-all-cases', 'view-timeline'],
  },
  'coordinador-provincial': {
    id: 'coordinador-provincial',
    name: 'Coordinador Provincial',
    description: 'Lectura del caso y timeline',
    port: 3002,
    color: 'bg-cyan-800',
    permissions: ['view-all-cases', 'view-timeline'],
  },
  'hospital-donante': {
    id: 'hospital-donante',
    name: 'Hospital Donante',
    description: 'Lectura de registro de donante y asignación',
    port: 3003,
    color: 'bg-emerald-800',
    permissions: ['view-donor', 'view-assignment'],
  },
  'hospital-receptor': {
    id: 'hospital-receptor',
    name: 'Hospital Receptor',
    description: 'Lectura de asignación, custodia y telemetría',
    port: 3004,
    color: 'bg-sky-800',
    permissions: ['view-assignment', 'view-telemetry'],
  },
  iot: {
    id: 'iot',
    name: 'Vista IoT',
    description: 'Solo telemetría del nodo de custodia',
    port: 3003,
    color: 'bg-amber-700',
    permissions: ['view-telemetry'],
  },
}

export function getRoleConfig(role: RoleType): RoleConfig {
  return ROLE_CONFIGS[role]
}

export function getAvailableRoles(): RoleType[] {
  return ['coordinador-nacional', 'coordinador-provincial', 'hospital-donante', 'hospital-receptor', 'iot']
}

/**
 * Header x-actor enviado al nodo.
 * La vista IoT no es una org del access control: lee el nodo de custodia
 * identificándose como hospital-donante (el nodo que ingiere telemetría).
 */
export function actorHeaderForRole(role: RoleType): string {
  return role === 'iot' ? 'hospital-donante' : role
}

export function getRoleNodeURL(role: RoleType): string {
  return NODE_URLS[role]
}

export type CaseFocus = 'full' | 'donor' | 'custody' | 'telemetry'

export function caseFocusForRole(role: RoleType): CaseFocus {
  if (role === 'iot') return 'telemetry'
  if (role === 'hospital-receptor') return 'custody'
  if (role === 'hospital-donante') return 'donor'
  return 'full'
}
