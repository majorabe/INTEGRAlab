/**
 * Test 07: Endorsement - WaitingList con doble firma (coordinador-nacional + hospital)
 * Verifica que políticas de endorsement N-of-M funcionen correctamente
 * Requiere: coordinador-nacional + al menos 1 org adicional
 */

const { createAuthenticatedClient } = require('../helpers/http');
const { makePatient } = require('../helpers/fixtures');

async function run() {
  const name = 'test07_waitingListDobleFirma';

  try {
    // Preparar payload
    const payload = makePatient(7);

    // Obtener firmas de dos orgs
    const coordClient = createAuthenticatedClient('coordinador-nacional');
    const hospClient = createAuthenticatedClient('hospital-donante');

    // /sign endpoint requiere payload wrapeado
    const signPayload = { payload };

    const coordSigResponse = await coordClient.post('/sign', signPayload);
    if (!coordSigResponse.data || !coordSigResponse.data.signature) {
      return {
        name,
        passed: false,
        detail: 'No se obtuvo firma de coordinador-nacional',
      };
    }

    const hospSigResponse = await hospClient.post('/sign', signPayload);
    if (!hospSigResponse.data || !hospSigResponse.data.signature) {
      return {
        name,
        passed: false,
        detail: 'No se obtuvo firma de hospital-donante',
      };
    }

    // Enviar transacción con ambas firmas
    const txPayload = {
      payload,
      signatures: [
        { actor: 'coordinador-nacional', signature: coordSigResponse.data.signature },
        { actor: 'hospital-donante', signature: hospSigResponse.data.signature },
      ],
    };

    const txResponse = await coordClient.post('/tx/waiting-list', txPayload);

    if (!txResponse.data || !txResponse.data.ok) {
      return {
        name,
        passed: false,
        detail: `Transacción rechazada: ${txResponse.data?.reason || 'unknown'}`,
      };
    }

    return {
      name,
      passed: true,
      detail: 'Endorsement: Doble firma aceptada y grabada en ledger',
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
