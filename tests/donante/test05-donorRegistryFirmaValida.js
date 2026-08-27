/**
 * Test 05: Baseline - DonorRegistry con firma válida
 * Verifica que transacción con firma válida sea aceptada
 */

const { createAuthenticatedClient } = require('../helpers/http');
const { donorPayload } = require('../helpers/fixtures');

async function run() {
  const name = 'test05_donorRegistryFirmaValida';

  try {
    const client = createAuthenticatedClient('hospital-donante');

    // Preparar payload
    const payload = { ...donorPayload };

    // Obtener firma
    const signResponse = await client.post('/sign', { payload });
    if (!signResponse.data || !signResponse.data.signature) {
      return {
        name,
        passed: false,
        detail: 'No se obtuvo firma del hospital',
      };
    }

    // Enviar transacción DonorRegistry con firma
    const txPayload = {
      payload,
      signatures: [
        { actor: 'hospital-donante', signature: signResponse.data.signature },
      ],
    };

    const response = await client.post('/tx/donor-registry', txPayload);

    if (!response.data || !response.data.ok) {
      return {
        name,
        passed: false,
        detail: `Transacción rechazada: ${response.data?.reason || 'unknown'}`,
      };
    }

    return {
      name,
      passed: true,
      detail: 'Donor Registry: Firma válida aceptada y grabada en ledger',
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
