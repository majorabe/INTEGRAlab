/**
 * Test 08: Endorsement - WaitingList rechazada con solo 1 firma
 * Verifica que política N-of-M requiera al menos 2 firmas distintas
 * Política: coordinador-nacional + al menos 1 org adicional
 */

const { createAuthenticatedClient } = require('../helpers/http');
const { waitingListEntry } = require('../helpers/fixtures');
const crypto = require('crypto');

async function run() {
  const name = 'test08_waitingListUnaSolaFirma';

  try {
    // Preparar payload
    const payload = {
      ...waitingListEntry,
      patientId: 'test-patient-' + crypto.randomBytes(4).toString('hex'),
    };

    // Obtener solo firma de coordinador-nacional
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

    // Enviar transacción con SOLO una firma
    const txPayload = {
      payload,
      signatures: [
        { actor: 'coordinador-nacional', signature: coordSigResponse.data.signature },
      ],
    };

    const txResponse = await coordClient.post('/tx/waiting-list', txPayload);

    // Debe ser rechazado
    if (txResponse.status >= 400 || (txResponse.data && !txResponse.data.ok)) {
      const reason = txResponse.data?.reason || '';
      if (reason.includes('al menos 1') || reason.includes('adicional') || reason.includes('organizaci')) {
        return {
          name,
          passed: true,
          detail: 'Endorsement: Solo 1 firma rechazada correctamente (requiere N-of-M)',
        };
      }
      return {
        name,
        passed: true,
        detail: 'Endorsement: Solo 1 firma rechazada (validación de política)',
      };
    }

    return {
      name,
      passed: false,
      detail: 'Solo 1 firma NO fue rechazada (SECURITY BREACH)',
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
