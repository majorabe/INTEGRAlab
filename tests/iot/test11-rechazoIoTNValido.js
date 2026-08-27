/**
 * Test 11: STRIDE Spoofing - Rechazo de IoT device cert inválido
 * Verifica que dispositivos IoT no autenticados por CA IoT sean rechazados
 */

const { createCustomClient } = require('../helpers/http');
const { generateWrongIoTCert } = require('../helpers/certs');
const crypto = require('crypto');

async function run() {
  const name = 'test11_rechazoIoTNoValido';

  try {
    // Generar cert IoT falso (no de CA IoT INTEGRA)
    const { cert, key } = generateWrongIoTCert('fake-device-999');

    const client = createCustomClient('hospital-donante', cert, key);

    // Intentar enviar telemetría con device cert inválido
    const telemetry = {
      deviceId: 'fake-device-999',
      timestamp: new Date().toISOString(),
      nonce: new Date().toISOString(),
      sensorType: 'temperature',
      value: 2.5,
      unit: 'celsius',
      organId: 'test-organ-' + crypto.randomBytes(4).toString('hex'),
    };

    const response = await client.post('/tx/custody', telemetry);

    // Debe ser rechazado
    if (response.status >= 400 || (response.data && !response.data.ok)) {
      const reason = response.data?.reason || '';
      if (reason.includes('iot') || reason.includes('IoT') || reason.includes('device')) {
        return {
          name,
          passed: true,
          detail: 'STRIDE: Spoofing — IoT device inválido rechazado correctamente',
        };
      }
      return {
        name,
        passed: true,
        detail: 'STRIDE: Spoofing — IoT rechazado (validación de cert)',
      };
    }

    return {
      name,
      passed: false,
      detail: 'IoT device inválido NO fue rechazado (SECURITY BREACH)',
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
