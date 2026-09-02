/**
 * Test 03: STRIDE Spoofing - Rechazo de cert expirado
 * CHECKPOINT: Aprobado por usuario
 * Verifica que certs con notAfter en pasado sean rechazados
 */

const { createCustomClient } = require('../helpers/http');
const { generateExpiredCert } = require('../helpers/certs');
const { makeDonor } = require('../helpers/fixtures');

async function run() {
  const name = 'test03_certExpirado';

  try {
    // Generar cert expirado
    const { cert, key } = generateExpiredCert('hospital-donante');
    const client = createCustomClient('hospital-donante', cert, key);

    // Intentar enviar transacción con cert expirado
    const response = await client.post('/tx/donor-registry', makeDonor(3));

    // Debe ser rechazado
    if (response.status >= 400 || (response.data && !response.data.ok)) {
      return {
        name,
        passed: true,
        detail: 'STRIDE: Spoofing — Cert expirado rechazado correctamente',
      };
    }

    return {
      name,
      passed: false,
      detail: 'Cert expirado NO fue rechazado (SECURITY BREACH)',
    };
  } catch (err) {
    // Error esperado: validación de cert expirado
    if (
      err.message.includes('CERT') ||
      err.message.includes('certificate') ||
      err.message.includes('expired') ||
      err.message.includes('notAfter')
    ) {
      return {
        name,
        passed: true,
        detail: 'STRIDE: Spoofing — Cert expirado rechazado en nivel TLS',
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
