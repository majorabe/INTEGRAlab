/**
 * Fixtures: payloads base reutilizables para tests
 */

const crypto = require('crypto');

// Donante válido para pruebas
const donorPayload = {
  donorId: 'test-donor-' + crypto.randomBytes(4).toString('hex'),
  bloodType: 'O+',
  hlaProfile: {
    A: 'A2',
    B: 'B7',
    DR: 'DR4',
  },
  organType: 'kidney',
  preservationMethod: 'static-cold',
};

// Entrada a la lista de espera (candidato)
const waitingListEntry = {
  patientId: 'test-patient-' + crypto.randomBytes(4).toString('hex'),
  bloodType: 'O+',
  hlaProfile: {
    A: 'A2',
    B: 'B7',
    DR: 'DR4',
  },
  urgencyLevel: 3,
};

// Lectura de telemetría válida desde IoT
const telemetryPayload = {
  deviceId: 'sensor-contenedor-001',
  timestamp: new Date().toISOString(),
  sensorType: 'temperature',
  value: 2.5,
  unit: 'celsius',
  organId: 'test-organ-001',
};

// Asignación válida
const assignmentPayload = {
  donorId: 'test-donor-001',
  recipientId: 'test-patient-001',
  organ: 'kidney',
  compatibilityTimestamp: new Date().toISOString(),
};

module.exports = {
  donorPayload,
  waitingListEntry,
  telemetryPayload,
  assignmentPayload,
};
