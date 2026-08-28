/**
 * Test 19: Quorum de Replicación - Rechazo sin Mayoría
 *
 * Verifica que el sistema rechace una transacción cuando NO se alcanza
 * quorum de red (3 de 4 nodos), incluso si tiene endorsement válido.
 *
 * Esto previene bloques huérfanos: sin quorum, el bloque NO se persiste
 * localmente.
 */

const axios = require('axios');
const { createAuthenticatedClient } = require('../helpers/http');
const { waitingListEntry } = require('../helpers/fixtures');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuración
const NODOS_A_DETENER = [
  'integralab-coordinador-provincial-1',
  'integralab-hospital-receptor-1'
];
const LEDGER_PATHS = {
  'coordinador-nacional': '/home/majorabe/proyectos/INTEGRAlab/data/coordinador-nacional/ledger.json',
  'hospital-donante': '/home/majorabe/proyectos/INTEGRAlab/data/hospital-donante/ledger.json',
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const name = 'test19_quorumWithDownPeers';
  let nodosDetenidos = false;

  try {
    // SETUP: Leer estado actual de ledger
    const coordClient = createAuthenticatedClient('coordinador-nacional');

    // Obtener estado inicial (usar axios directo con x-actor header)
    const initialLedgerResp = await axios.get('http://localhost:3001/ledger', {
      headers: { 'x-actor': 'coordinador-nacional' },
      validateStatus: () => true,
    });

    if (!initialLedgerResp.data || !initialLedgerResp.data.blocks) {
      return {
        name,
        passed: false,
        detail: `No se pudo leer ledger inicial. Status: ${initialLedgerResp.status}, Data: ${JSON.stringify(initialLedgerResp.data).substring(0, 200)}`,
      };
    }

    const initialBlockCount = initialLedgerResp.data.blocks.length;
    const lastBlockIndexBefore = initialLedgerResp.data.blocks.length > 0
      ? initialLedgerResp.data.blocks[initialLedgerResp.data.blocks.length - 1].index
      : -1;

    // PASO 1: Detener 2 nodos de verdad (docker stop)
    console.log(`    → Deteniendo nodos: ${NODOS_A_DETENER.join(', ')}`);
    try {
      execSync(`docker stop ${NODOS_A_DETENER.join(' ')}`, { stdio: 'pipe' });
      nodosDetenidos = true;
      await sleep(3000); // Esperar más tiempo a que se cierren y se disconecten las redes

      // Verificar que realmente están stopped
      try {
        const statusCheck = execSync(`docker ps --format="{{.Names}}" | grep -E "coordinador-provincial|hospital-receptor" || true`, { stdio: 'pipe' }).toString().trim();
        if (statusCheck.length > 0) {
          console.log(`    ⚠ Nodos aún están UP después de docker stop, esperando más...`);
          await sleep(2000);
        }
      } catch (e) {
        // Ignore errors in status check
      }
    } catch (err) {
      return {
        name,
        passed: false,
        detail: `No se pudo detener nodos: ${err.message}`,
      };
    }

    // PASO 2: Preparar transacción válida (con firmas correctas de 2 orgs)
    const payload = {
      ...waitingListEntry,
      patientId: 'test-quorum-' + crypto.randomBytes(4).toString('hex'),
    };

    // Obtener firmas válidas (desde nodos que SIGUEN ACTIVOS)
    const coordSigResp = await coordClient.post('/sign', { payload });
    if (!coordSigResp.data || !coordSigResp.data.signature) {
      return {
        name,
        passed: false,
        detail: 'No se obtuvo firma de coordinador-nacional',
      };
    }

    // Hospital Donante sigue activo (no fue detenido)
    const hospClient = createAuthenticatedClient('hospital-donante');
    const hospSigResp = await hospClient.post('/sign', { payload });
    if (!hospSigResp.data || !hospSigResp.data.signature) {
      return {
        name,
        passed: false,
        detail: 'No se obtuvo firma de hospital-donante',
      };
    }

    // PASO 3: Intentar enviar transacción a coordinador-nacional (puerto 3001)
    // Con 2 de 4 peers muertos, solo 2 peers responden (coordinador-nacional y hospital-donante)
    // Total votos: 1 (local) + 1 (hospital-donante) = 2 < 3 (QUORUM_NODOS)
    // Esperamos 503
    const txPayload = {
      payload,
      signatures: [
        { actor: 'coordinador-nacional', signature: coordSigResp.data.signature },
        { actor: 'hospital-donante', signature: hospSigResp.data.signature },
      ],
    };

    const txResponse = await coordClient.post('/tx/waiting-list', txPayload);

    // Debug: verificar qué peers respondieron
    if (txResponse.data && txResponse.data.replication) {
      const replicationResults = txResponse.data.replication;
      const successCount = replicationResults.filter(r => r.ok).length;
      console.log(`    → Replicación: ${successCount}/${replicationResults.length} peers OK`);
      replicationResults.forEach(r => {
        console.log(`       ${r.peer}: ${r.ok ? 'OK' : `FAIL - ${r.reason}`}`);
      });
    }

    // PASO 4: Verificar que fue rechazado con 503
    if (txResponse.status !== 503) {
      return {
        name,
        passed: false,
        detail: `Esperado status 503, recibido ${txResponse.status}. Quorum debería haber fallado. ` +
                `Replicación: ${JSON.stringify(txResponse.data?.replication || 'N/A')}`,
      };
    }

    if (!txResponse.data || txResponse.data.ok !== false) {
      return {
        name,
        passed: false,
        detail: 'Respuesta debe tener ok:false cuando quorum falla',
      };
    }

    // PASO 5: Verificar que quorum report muestra votos insuficientes
    if (!txResponse.data.quorum) {
      return {
        name,
        passed: false,
        detail: 'Falta info de quorum en respuesta 503',
      };
    }

    if (txResponse.data.quorum.votes >= 3) {
      return {
        name,
        passed: false,
        detail: `Quorum reports ${txResponse.data.quorum.votes} votos, pero debería ser < 3 con peers caídos`,
      };
    }

    // PASO 6: Verificar que ledger NO creció (bloque no se persistió localmente)
    // Verificar vía endpoint /ledger
    const ledgerAfterResp = await axios.get('http://localhost:3001/ledger', {
      headers: { 'x-actor': 'coordinador-nacional' },
      validateStatus: () => true,
    });

    if (!ledgerAfterResp.data || !ledgerAfterResp.data.blocks) {
      return {
        name,
        passed: false,
        detail: 'No se pudo releer ledger tras intento fallido',
      };
    }

    const finalBlockCount = ledgerAfterResp.data.blocks.length;
    if (finalBlockCount !== initialBlockCount) {
      return {
        name,
        passed: false,
        detail: `BUG CRÍTICO: Bloque fue persistido A PESAR de fallo de quorum. ` +
                `Bloques antes: ${initialBlockCount}, ahora: ${finalBlockCount}`,
      };
    }

    // PASO 7: Verificar directamente en ledger.json (verificación forense)
    try {
      const ledgerFileData = fs.readFileSync(
        LEDGER_PATHS['coordinador-nacional'],
        'utf8'
      );
      const ledgerBlocks = JSON.parse(ledgerFileData);

      if (ledgerBlocks.length !== initialBlockCount) {
        return {
          name,
          passed: false,
          detail: `BUG CRÍTICO (disk): ledger.json tiene ${ledgerBlocks.length} bloques ` +
                  `pero debería tener ${initialBlockCount}`,
        };
      }

      // Verificar que el último bloque no es el que intentamos agregar
      if (ledgerBlocks.length > 0) {
        const lastBlockOnDisk = ledgerBlocks[ledgerBlocks.length - 1];
        if (lastBlockOnDisk.payload &&
            lastBlockOnDisk.payload.patientId === payload.patientId) {
          return {
            name,
            passed: false,
            detail: 'CRÍTICO: Bloque se escribió en disco a pesar de rechazo de quorum',
          };
        }
      }
    } catch (err) {
      return {
        name,
        passed: false,
        detail: `No se pudo verificar ledger.json: ${err.message}`,
      };
    }

    // ✓ TEST PASÓ
    return {
      name,
      passed: true,
      detail: `Quorum: Transacción rechazada (503) sin quorum. Bloque no persistido localmente. ` +
              `Votos: ${txResponse.data.quorum.votes}/${txResponse.data.quorum.required}`,
    };

  } catch (err) {
    return {
      name,
      passed: false,
      detail: `Error: ${err.message}`,
    };
  } finally {
    // CLEANUP: SIEMPRE levantar los nodos, incluso si algo falló
    if (nodosDetenidos) {
      console.log(`    → Restaurando nodos: ${NODOS_A_DETENER.join(', ')}`);
      try {
        execSync(`docker start ${NODOS_A_DETENER.join(' ')}`, { stdio: 'pipe' });
        // Esperar a que levanten y estén healthy
        let retriesLeft = 30;
        let allHealthy = false;
        while (retriesLeft > 0 && !allHealthy) {
          await sleep(1000);
          try {
            const coordClient = createAuthenticatedClient('coordinador-nacional');
            const health = await coordClient.get('/health');
            if (health.status === 200) {
              allHealthy = true;
              console.log(`    → Nodos restaurados correctamente`);
            }
          } catch (e) {
            retriesLeft--;
          }
        }
        if (!allHealthy) {
          console.error(`    ⚠ Nodos tardaron mucho en restaurarse (timeout)`);
        }
      } catch (err) {
        console.error(`    ⚠ Error restaurando nodos: ${err.message}`);
      }
    }
  }
}

module.exports = { run };
