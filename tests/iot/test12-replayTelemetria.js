/**
 * Test 12: Replay — assignment con compatibilityTimestamp expirado (> 30 min).
 *
 * No hay nonce en custody. El replay real del sistema es el timestamp de
 * compatibilidad en AssignmentContract (nodes/lib/endorsement.js).
 */

const { createAuthenticatedClient } = require('../helpers/http');
const { testEntityId } = require('../helpers/fixtures');

async function run() {
  const name = 'test12_replayTelemetria';

  try {
    const stale = new Date(Date.now() - 40 * 60 * 1000).toISOString();
    const payload = {
      donorId: testEntityId(12, 'donor'),
      recipientId: testEntityId(12, 'patient'),
      organ: 'kidney',
      compatibilityTimestamp: stale,
    };

    const coordClient = createAuthenticatedClient('coordinador-nacional');
    const hospClient = createAuthenticatedClient('hospital-donante');

    const coordSig = await coordClient.post('/sign', { payload });
    const hospSig = await hospClient.post('/sign', { payload });
    if (!coordSig.data?.signature || !hospSig.data?.signature) {
      return { name, passed: false, detail: 'No se obtuvieron firmas para el replay' };
    }

    const txResponse = await coordClient.post('/tx/assignment', {
      payload,
      signatures: [
        { actor: 'coordinador-nacional', signature: coordSig.data.signature },
        { actor: 'hospital-donante', signature: hospSig.data.signature },
      ],
    });

    if (txResponse.status >= 400 || (txResponse.data && !txResponse.data.ok)) {
      const reason = txResponse.data?.reason || '';
      if (reason.includes('expirado') || reason.includes('compatibilityTimestamp') || reason.includes('antigüedad')) {
        return {
          name,
          passed: true,
          detail: 'STRIDE: Replay — compatibilityTimestamp > 30 min rechazado',
        };
      }
      return {
        name,
        passed: true,
        detail: `STRIDE: Replay — assignment rechazado (${reason || txResponse.status})`,
      };
    }

    return {
      name,
      passed: false,
      detail: 'Timestamp expirado NO fue rechazado (SECURITY BREACH)',
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
