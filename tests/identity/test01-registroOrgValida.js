/**
 * Test 01: Baseline - Registro con organización válida
 * STRIDE: Baseline (no threat)
 * Verifica que una organización legítima pueda registrarse y obtener ledger valid
 */

const { createAuthenticatedClient } = require('../helpers/http');
const { makeDonor } = require('../helpers/fixtures');

async function run() {
  const name = 'test01_registroOrgValida';

  try {
    const client = createAuthenticatedClient('hospital-donante');

    // Preparar payload
    const payload = makeDonor(1);

    // Obtener firma
    const signResponse = await client.post('/sign', { payload });
    if (!signResponse.data || !signResponse.data.signature) {
      return {
        name,
        passed: false,
        detail: 'No se obtuvo firma del hospital',
      };
    }

    // Enviar transacción DonorRegistry válida con firma
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

    // Si la transacción fue aceptada por el servidor, consideramos que pasó
    // (El ledger se verifica en otros tests; aquí validamos el flujo de firma)
    return {
      name,
      passed: true,
      detail: 'STRIDE: Baseline — Org válida registra donante exitosamente',
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
