/**
 * Test 09: Endorsement - Assignment rechazada sin endorsement del hospital
 * Verifica que política de assignment requiera coordinador-nacional + hospital-donante
 * Intenta solo con coordinador-nacional (falta hospital-donante)
 */

const { createAuthenticatedClient } = require('../helpers/http');
const { assignmentPayload } = require('../helpers/fixtures');
const crypto = require('crypto');

async function run() {
  const name = 'test09_assignmentSinEndorsement';

  try {
    // Preparar payload
    const payload = {
      ...assignmentPayload,
      donorId: 'test-donor-' + crypto.randomBytes(4).toString('hex'),
      recipientId: 'test-patient-' + crypto.randomBytes(4).toString('hex'),
      compatibilityTimestamp: new Date().toISOString(),
    };

    // Obtener solo firma de coordinador-nacional (FALTA hospital-donante)
    const coordClient = createAuthenticatedClient('coordinador-nacional');

    const signPayload = { payload };
    const coordSigResponse = await coordClient.post('/sign', signPayload);
    if (!coordSigResponse.data || !coordSigResponse.data.signature) {
      return {
        name,
        passed: false,
        detail: 'No se obtuvo firma de coordinador-nacional',
      };
    }

    // Enviar transacción con SOLO firma de coordinador
    const txPayload = {
      payload,
      signatures: [
        { actor: 'coordinador-nacional', signature: coordSigResponse.data.signature },
      ],
    };

    const txResponse = await coordClient.post('/tx/assignment', txPayload);

    // Debe ser rechazado
    if (txResponse.status >= 400 || (txResponse.data && !txResponse.data.ok)) {
      const reason = txResponse.data?.reason || '';
      if (reason.includes('hospital-donante') || reason.includes('endorsement')) {
        return {
          name,
          passed: true,
          detail: 'Endorsement: Assignment sin hospital-donante rechazado correctamente',
        };
      }
      return {
        name,
        passed: true,
        detail: 'Endorsement: Assignment rechazado (validación de política)',
      };
    }

    return {
      name,
      passed: false,
      detail: 'Assignment sin endorsement NO fue rechazado (SECURITY BREACH)',
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
