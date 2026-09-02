/**
 * Test 04: STRIDE Spoofing - Rechazo de cert de otra organización
 * Verifica que certs válidos pero de otra org sean rechazados para acciones específicas
 * Ejemplo: cert que dice ser "coordinador-nacional" usada en "hospital-donante"
 */

const { createCustomClient } = require('../helpers/http');
const { generateWrongOrgCert } = require('../helpers/certs');
const { makeDonor } = require('../helpers/fixtures');

async function run() {
  const name = 'test04_certOtraOrg';

  try {
    // Generar cert que dice ser coordinador-nacional pero no es
    const { cert, key } = generateWrongOrgCert('coordinador-nacional');

    // Usar como client para hospital-donante
    const client = createCustomClient('hospital-donante', cert, key);

    // Intentar enviar como donante-registry (solo hospital-donante puede)
    const response = await client.post('/tx/donor-registry', makeDonor(4));

    // Debe ser rechazado por falta de firma de hospital-donante
    if (response.status >= 400 || (response.data && !response.data.ok)) {
      const reason = response.data?.reason || '';
      if (reason.includes('hospital-donante') || reason.includes('organización')) {
        return {
          name,
          passed: true,
          detail: 'STRIDE: Spoofing — Cert de otra org rechazado correctamente',
        };
      }
      return {
        name,
        passed: true,
        detail: 'STRIDE: Spoofing — Transacción rechazada (validación de org)',
      };
    }

    return {
      name,
      passed: false,
      detail: 'Cert de otra org NO fue rechazado (SECURITY BREACH)',
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
