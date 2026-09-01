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
    description: 'Réplica orderer (puerto 3001). Misma cadena que los pares.',
    port: 3001,
    color: 'bg-teal-800',
    permissions: ['view-all-cases', 'view-timeline'],
  },
  'coordinador-provincial': {
    id: 'coordinador-provincial',
    name: 'Coordinador Provincial',
    description: 'Réplica en puerto 3002. Misma cadena que los pares.',
    port: 3002,
    color: 'bg-cyan-800',
    permissions: ['view-all-cases', 'view-timeline'],
  },
  'hospital-donante': {
    id: 'hospital-donante',
    name: 'Hospital Donante',
    description: 'Réplica en puerto 3003. Nodo que ingiere telemetría IoT.',
    port: 3003,
    color: 'bg-emerald-800',
    permissions: ['view-donor', 'view-assignment'],
  },
  'hospital-receptor': {
    id: 'hospital-receptor',
    name: 'Hospital Receptor',
    description: 'Réplica en puerto 3004. Misma cadena que los pares.',
    port: 3004,
    color: 'bg-sky-800',
    permissions: ['view-assignment', 'view-telemetry'],
  },
  iot: {
    id: 'iot',
    name: 'Vista IoT',
    description: 'Lee telemetría desde el nodo de custodia (hospital-donante).',
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
  // Los 4 nodos tienen la misma cadena. El selector elige desde qué réplica
  // se lee, no un filtro de privacidad en el API. La vista IoT sí se centra
  // en telemetría (operador del contenedor).
  if (role === 'iot') return 'telemetry'
  return 'full'
}
