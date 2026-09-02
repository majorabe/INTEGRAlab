/**
 * Test 06: STRIDE Tampering/Repudiation - DonorRegistry sin firma rechazada
 * Verifica que transacciones sin firma sean rechazadas
 */

const { createClient } = require('../helpers/http');
const { makeDonor } = require('../helpers/fixtures');

async function run() {
  const name = 'test06_donorRegistrySinFirma';

  try {
    // Cliente sin cert/key (anónimo)
    const client = createClient('hospital-donante');

    // Intentar enviar sin firma
    const response = await client.post('/tx/donor-registry', makeDonor(6));

    // Debe ser rechazado
    if (response.status >= 400 || (response.data && !response.data.ok)) {
      const reason = response.data?.reason || '';
      if (reason.includes('firma') || reason.includes('signature') || reason.includes('endorsement')) {
        return {
          name,
          passed: true,
          detail: 'STRIDE: Tampering — Transacción sin firma rechazada correctamente',
        };
      }
      return {
        name,
        passed: true,
        detail: 'STRIDE: Tampering — Transacción sin firma rechazada',
      };
    }

    return {
      name,
      passed: false,
      detail: 'Transacción sin firma NO fue rechazada (SECURITY BREACH)',
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
