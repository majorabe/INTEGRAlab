/**
 * Fixtures: payloads base reutilizables para tests.
 *
 * IDs visibles en /dashboard, convención:
 *   test{NN}-{rol}[-{tag}]-{xxxx}
 *
 *   NN   = número del test (01–20)
 *   rol  = donor | patient | organ
 *   tag  = opcional (pre, durante, 1…n) cuando el test crea varios
 *   xxxx = 4 hex para no chocar al re-ejecutar la suite
 *
 * Ejemplos: test05-donor-a3f2, test17-donor-3-b1c0, test20-patient-9e2d
 */

const crypto = require('crypto');

function testEntityId(testNum, role, tag) {
  const n = String(testNum).padStart(2, '0');
  const suffix = crypto.randomBytes(2).toString('hex');
  return ['test' + n, role, tag, suffix].filter(Boolean).join('-');
}

const donorFields = {
  bloodType: 'O+',
  hlaProfile: {
    A: 'A2',
    B: 'B7',
    DR: 'DR4',
  },
  organType: 'kidney',
  preservationMethod: 'static-cold',
};

const patientFields = {
  bloodType: 'O+',
  hlaProfile: {
    A: 'A2',
    B: 'B7',
    DR: 'DR4',
  },
  urgencyLevel: 3,
};

function makeDonor(testNum, tag) {
  return { ...donorFields, donorId: testEntityId(testNum, 'donor', tag) };
}

function makePatient(testNum, tag) {
  return { ...patientFields, patientId: testEntityId(testNum, 'patient', tag) };
}

// Plantillas (sin ID único). Preferir makeDonor / makePatient / testEntityId.
const donorPayload = {
  donorId: 'test-donor',
  ...donorFields,
};

const waitingListEntry = {
  patientId: 'test-patient',
  ...patientFields,
};

const telemetryPayload = {
  deviceId: 'sensor-contenedor-001',
  timestamp: new Date().toISOString(),
  sensorType: 'temperature',
  value: 2.5,
  unit: 'celsius',
  organId: 'test-organ',
};

const assignmentPayload = {
  donorId: 'test-donor',
  recipientId: 'test-patient',
  organ: 'kidney',
  compatibilityTimestamp: new Date().toISOString(),
};

module.exports = {
  testEntityId,
  makeDonor,
  makePatient,
  donorPayload,
  waitingListEntry,
  telemetryPayload,
  assignmentPayload,
};
