/**
 * Development Fixtures for Dashboard Fase 2
 *
 * These fixtures use the demo-dev-* naming convention to avoid conflicts with:
 * - Security tests (test-*)
 * - Fase 1 dashboard tests (donor-dashboard-*)
 * - Final pitch data (demo-pitch-*)
 *
 * See DECISIONES_DE_ALCANCE.md §8 for naming conventions.
 */

import { DonorRegistryForm, WaitingListEntryForm, AssignmentForm } from './types'

export const DEV_DONOR_ID = 'demo-dev-donor-001'
export const DEV_PATIENT_ID = 'demo-dev-patient-001'
export const DEV_ORG_ID = DEV_DONOR_ID // organId used for telemetry linkage

/**
 * Sample donor registry payload for development
 */
export const devDonorPayload: DonorRegistryForm = {
  donorId: DEV_DONOR_ID,
  bloodType: 'O+',
  hlaProfile: {
    A: 'A2',
    B: 'B7',
    DR: 'DR5',
  },
  organType: 'kidney',
  preservationMethod: 'static-cold',
}

/**
 * Sample patient waiting list entry for development
 */
export const devPatientPayload: WaitingListEntryForm = {
  patientId: DEV_PATIENT_ID,
  bloodType: 'O+',
  hlaProfile: {
    A: 'A2',
    B: 'B7',
    DR: 'DR4',
  },
  urgencyLevel: 3,
}

/**
 * Sample HLA compatibility donor profile
 */
export const devDonorProfile = {
  bloodType: 'O+',
  hlaProfile: {
    A: 'A2',
    B: 'B7',
    DR: 'DR5',
  },
}

/**
 * Sample waiting list for compatibility query
 */
export const devWaitingList = [
  {
    patientId: DEV_PATIENT_ID,
    bloodType: 'O+',
    hlaProfile: {
      A: 'A2',
      B: 'B7',
      DR: 'DR4',
    },
    urgencyLevel: 3,
  },
  {
    patientId: 'demo-dev-patient-002',
    bloodType: 'A+',
    hlaProfile: {
      A: 'A1',
      B: 'B8',
      DR: 'DR3',
    },
    urgencyLevel: 5,
  },
]

/**
 * Sample telemetry reading
 * Uses the REAL payload schema from iot-simulator (iot-simulator/simulate.js):
 * - temperaturaC: temperature in Celsius
 * - humedadPct: humidity percentage
 * - gps: GPS coordinates (lat, lon)
 * - fueraDeRango: boolean indicating out-of-range alert
 * - organo: organ type (rinon, higado, etc.)
 *
 * Important: organId MUST match donorId for dashboard projection to work
 * See DECISIONES_DE_ALCANCE.md §9
 */
export const devTelemetryPayload = {
  deviceId: 'sensor-contenedor-001',
  organo: 'rinon',
  secuencia: 1,
  timestamp: new Date().toISOString(),
  temperaturaC: 2.5,
  humedadPct: 45.3,
  gps: { lat: -32.9468, lon: -60.6393 },
  fueraDeRango: false,
  organId: DEV_ORG_ID, // CRITICAL: must match donorId for projection to work
}

/**
 * Generate a telemetry reading with realistic temperature variation
 * Schema matches iot-simulator output (simulate.js generarLectura)
 */
export function generateTelemetryReading(
  donorId: string = DEV_DONOR_ID,
  temperaturaC: number = 2.5,
  secuencia: number = 1,
  simularAlerta: boolean = false
) {
  const temperatura = simularAlerta ? 5.5 : temperaturaC // Out of range: > 4°C for kidney
  return {
    deviceId: 'sensor-contenedor-001',
    organo: 'rinon',
    secuencia,
    timestamp: new Date().toISOString(),
    temperaturaC: temperatura,
    humedadPct: 40 + Math.random() * 10,
    gps: {
      lat: -32.9468 + Math.random() * 0.01,
      lon: -60.6393 + Math.random() * 0.01
    },
    fueraDeRango: temperatura < 0 || temperatura > 4, // Kidney thresholds: 0-4°C
    organId: donorId, // Link to donor case via organId
  }
}

/**
 * Development workflow sequence for testing the full flow
 * Use this to verify end-to-end functionality:
 *
 * 1. Register donor: devDonorPayload
 * 2. Add patient to waiting list: devPatientPayload
 * 3. Query compatibility: devDonorProfile + devWaitingList
 * 4. Create assignment (needs compatibilityTimestamp from step 3)
 * 5. Add telemetry: devTelemetryPayload (multiple times with different values)
 * 6. Query case: GET /dashboard/casos/demo-dev-donor-001
 * 7. Check telemetry linked: GET /dashboard/casos/demo-dev-donor-001/telemetria
 */
export const DEV_WORKFLOW_NOTES = `
Development Workflow - Demo-Dev-Donor-001:

1. Coordinador Nacional role:
   - View all cases
   - Query compatibility for devDonorProfile

2. Hospital Donante role:
   - Register donor (devDonorPayload)
   - Endorse assignments

3. Coordinador Provincial role:
   - Approve waiting list entry

4. Switch roles to add telemetry:
   - Hospital can add multiple telemetry readings
   - Each reading linked via organId

5. View dashboard:
   - GET /dashboard/casos/demo-dev-donor-001
   - Timeline shows all events in order
   - Telemetria returns all sensor readings
`
