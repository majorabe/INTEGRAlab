/**
 * Test Runner para INTEGRA Security Test Suite
 * Ejecuta 20 tests organizados en 8 bloques (A-H)
 * Bloques A-G: Paso 1-2 (Criptografía, Endorsement, IoT, RBAC, Resiliencia, Auditoría)
 * Bloque H: Fase 3-4 (Quorum de Replicación)
 */

const path = require('path');
const { waitForStack } = require('./helpers/http');

// Definición de bloques y tests
const TEST_BLOCKS = [
  {
    name: 'Block A: Identidad y PKI',
    tests: [
      'identity/test01-registroOrgValida.js',
      'identity/test02-rechazoSpoofing.js',
      'identity/test03-certExpirado.js',
      'identity/test04-certOtraOrg.js',
    ],
  },
  {
    name: 'Block B: Registro de Donantes',
    tests: [
      'donante/test05-donorRegistryFirmaValida.js',
      'donante/test06-donorRegistrySinFirma.js',
    ],
  },
  {
    name: 'Block C: Endorsement (Lista de Espera + Asignación)',
    tests: [
      'lista-espera/test07-waitingListDobleFirma.js',
      'lista-espera/test08-waitingListUnaSolaFirma.js',
      'lista-espera/test09-assignmentSinEndorsement.js',
    ],
  },
  {
    name: 'Block D: IoT y Cadena de Custodia',
    tests: [
      'iot/test10-telemetriaFirmada.js',
      'iot/test11-rechazoIoTNValido.js',
      'iot/test12-replayTelemetria.js',
    ],
  },
  {
    name: 'Block E: Control de Acceso (RBAC)',
    tests: [
      'control-acceso/test13-lecturaNoAutorizada.js',
      'control-acceso/test14-iotNoEscribeWaitingList.js',
      'control-acceso/test15-medicoNoEmiteAssignment.js',
    ],
  },
  {
    name: 'Block F: Resiliencia',
    tests: [
      'resiliencia/test16-caidaDeNodo.js',
      'resiliencia/test17-escrituraConcurrente.js',
    ],
  },
  {
    name: 'Block G: Trazabilidad y Auditoría',
    tests: [
      'trazabilidad/test18-auditoriaFirmasE2E.js',
      'trazabilidad/test20-receptionCierraCircuito.js',
    ],
  },
  {
    name: 'Block H: Quorum de Replicación (Fase 3-4)',
    tests: [
      'red-quorum/test19-quorumWithDownPeers.js',
    ],
  },
];

const TEST_BLOCKS_FLATTENED = TEST_BLOCKS.flatMap(b => b.tests);

/**
 * Ejecuta un test individual y captura resultados
 */
async function runTest(testPath) {
  const testModule = require(path.join(__dirname, testPath));
  const startTime = Date.now();

  try {
    const result = await testModule.run();
    const ms = Date.now() - startTime;
    return {
      ...result,
      ms,
    };
  } catch (err) {
    return {
      name: testPath,
      passed: false,
      detail: `Error: ${err.message}`,
      ms: Date.now() - startTime,
    };
  }
}

/**
 * Formatea output de un test para consola
 */
function formatTestResult(result) {
  const status = result.skipped ? '↷' : result.passed ? '✔' : '✘';
  const timeStr = `${result.ms}ms`;
  return `${status} ${result.name.padEnd(50)} — ${result.detail} (${timeStr})`;
}

/**
 * Ejecuta la suite completa
 */
async function runTestSuite() {
  console.log('\n========================================');
  console.log('INTEGRA Security Test Suite');
  console.log('========================================\n');

  // Verificar que Docker Compose stack está listo
  console.log('⏳ Verificando disponibilidad del stack...\n');
  try {
    await waitForStack();
  } catch (err) {
    console.error('✘ ERROR: Stack no está disponible');
    console.error(`  ${err.message}`);
    process.exit(1);
  }

  const results = [];
  let totalTests = 0;
  let passedTests = 0;
  let skippedTests = 0;

  // Ejecutar tests por bloque
  for (const block of TEST_BLOCKS) {
    console.log(`\n${block.name}`);
    console.log('-'.repeat(80));

    for (const testPath of block.tests) {
      totalTests++;
      const result = await runTest(testPath);
      results.push(result);

      console.log(formatTestResult(result));

      if (result.skipped) {
        skippedTests++;
      } else if (result.passed) {
        passedTests++;
      }
    }
  }

  // Resumen final
  console.log('\n========================================');
  console.log('RESUMEN');
  console.log('========================================\n');
  const failedTests = results.filter((r) => !r.passed && !r.skipped);
  console.log(`Total: ${passedTests}/${totalTests} PASS${skippedTests ? ` (${skippedTests} saltados)` : ''}\n`);

  if (failedTests.length > 0) {
    console.log('Tests Fallidos:');
    failedTests.forEach(test => {
      console.log(`  ✘ ${test.name}: ${test.detail}`);
    });
    console.log('');
  }

  const summary = {
    passed: passedTests,
    total: totalTests,
    skipped: skippedTests,
    failed: failedTests.map((t) => ({ name: t.name, detail: t.detail })),
    tests: results.map((r) => ({
      name: r.name,
      passed: Boolean(r.passed),
      skipped: Boolean(r.skipped),
      detail: r.detail || '',
      ms: r.ms || 0,
    })),
  };
  console.log(`__SUITE_JSON__${JSON.stringify(summary)}`);

  process.exit(failedTests.length === 0 ? 0 : 1);
}

// Ejecutar
runTestSuite().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
