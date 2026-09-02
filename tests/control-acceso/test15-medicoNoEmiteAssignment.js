/**
 * Test 15: STRIDE Elevation of Privilege - Hospital (médico) no puede emitir assignment
 * Solo coordinador-nacional puede iniciar asignaciones
 */

const { createAuthenticatedClient } = require('../helpers/http');
const { testEntityId } = require('../helpers/fixtures');

async function run() {
  const name = 'test15_medicoNoEmiteAssignment';

  try {
    const hospClient = createAuthenticatedClient('hospital-donante');

    // Preparar payload de asignación
    const payload = {
      payload: {
        donorId: testEntityId(15, 'donor'),
        recipientId: testEntityId(15, 'patient'),
        organ: 'kidney',
        compatibilityTimestamp: new Date().toISOString(),
      },
    };

    // Obtener firma desde hospital-donante (no debe poder firmar assignment)
    const hospSigResponse = await hospClient.post('/sign', payload);
    if (!hospSigResponse.data || !hospSigResponse.data.signature) {
      return {
        name,
        passed: false,
        detail: 'No se obtuvo firma de hospital-donante',
      };
    }

    // Intentar enviar assignment solo con firma del hospital
    const txPayload = {
      payload: payload.payload,
      signatures: [
        { actor: 'hospital-donante', signature: hospSigResponse.data.signature },
      ],
    };

    const txResponse = await hospClient.post('/tx/assignment', txPayload);

    // Debe ser rechazado (falta coordinador-nacional)
    if (txResponse.status >= 400 || (txResponse.data && !txResponse.data.ok)) {
      const reason = txResponse.data?.reason || '';
      if (reason.includes('coordinador-nacional') || reason.includes('naciona')) {
        return {
          name,
          passed: true,
          detail: 'STRIDE: EoP — Hospital bloqueado de emitir assignment',
        };
      }
      return {
        name,
        passed: true,
        detail: 'STRIDE: EoP — Hospital rechazado de emitir assignment',
      };
    }

    return {
      name,
      passed: false,
      detail: 'Hospital NO fue bloqueado de emitir assignment (SECURITY BREACH)',
    };
  } catch (err) {
    return {
      name,
      passed: false,
      detail: `Error: ${err.message}`,
    };
  }
}

module.exports = { run };
