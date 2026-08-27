/**
 * Test 02: STRIDE Spoofing - Rechazo de cert autofirmado
 * Verifica que certs autofirmados (no de CA INTEGRA) sean rechazados
 */

const { createCustomClient } = require('../helpers/http');
const { generateSelfSignedCert } = require('../helpers/certs');
const { donorPayload } = require('../helpers/fixtures');

async function run() {
  const name = 'test02_rechazoSpoofing';

  try {
    // Generar cert autofirmado
    const { cert, key } = generateSelfSignedCert();
    const client = createCustomClient('hospital-donante', cert, key);

    // Intentar enviar transacción con cert spoofed
    const response = await client.post('/tx/donor-registry', donorPayload);

    // Debe ser rechazado (status 401/403 o ok:false)
    if (response.status >= 400 || (response.data && !response.data.ok)) {
      return {
        name,
        passed: true,
        detail: 'STRIDE: Spoofing — Cert autofirmado rechazado correctamente',
      };
    }

    return {
      name,
      passed: false,
      detail: 'Cert autofirmado NO fue rechazado (SECURITY BREACH)',
    };
  } catch (err) {
    // Esperado: error de certificado
    if (err.message.includes('CERT') || err.message.includes('certificate')) {
      return {
        name,
        passed: true,
        detail: 'STRIDE: Spoofing — Cert rechazado en nivel TLS',
      };
    }
    return {
      name,
      passed: false,
      detail: `Error inesperado: ${err.message}`,
    };
  }
}

module.exports = { run };
