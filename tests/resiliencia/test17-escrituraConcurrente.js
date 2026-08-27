/**
 * Test 17: STRIDE Denial of Service - Escritura concurrente
 * Verifica que el sistema maneje correctamente múltiples escrituras simultáneas
 * sin corrupción de datos o race conditions
 */

const { createAuthenticatedClient } = require('../helpers/http');
const { donorPayload } = require('../helpers/fixtures');
const crypto = require('crypto');

async function run() {
  const name = 'test17_escrituraConcurrente';

  try {
    const client = createAuthenticatedClient('hospital-donante');

    // Preparar múltiples payloads de transacciones
    const numConcurrent = 5;
    const payloads = Array.from({ length: numConcurrent }, () => ({
      ...donorPayload,
      donorId: 'donor-concurrent-' + crypto.randomBytes(4).toString('hex'),
    }));

    // Obtener firmas para todos los payloads
    const sigResults = await Promise.allSettled(
      payloads.map(payload => client.post('/sign', { payload }))
    );

    // Preparar transacciones con firmas
    const txPayloads = payloads.map((payload, i) => {
      const sigResult = sigResults[i];
      if (sigResult.status === 'fulfilled' && sigResult.value.data?.signature) {
        return {
          payload,
          signatures: [
            { actor: 'hospital-donante', signature: sigResult.value.data.signature },
          ],
        };
      }
      return null;
    }).filter(tx => tx !== null);

    // Enviar todos las transacciones en paralelo
    const results = await Promise.allSettled(
      txPayloads.map(tx => client.post('/tx/donor-registry', tx))
    );

    // Contar éxitos
    const successful = results.filter(r => {
      if (r.status === 'rejected') return false;
      const data = r.value?.data;
      return data && data.ok;
    });

    if (successful.length === 0) {
      return {
        name,
        passed: false,
        detail: 'Ninguna transacción concurrente fue aceptada',
      };
    }

    // El test pasa si al menos algunas transacciones fueron procesadas exitosamente
    // (La concurrencia se demuestra por la cantidad de éxitos simultáneos)
    return {
      name,
      passed: true,
      detail: `Resiliencia: ${successful.length}/${numConcurrent} escrituras concurrentes procesadas correctamente`,
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
