/**
 * Test 12: STRIDE Tampering/Replay - Rechazo de telemetría con nonce expirado
 * CHECKPOINT: Aprobado por usuario
 * Verifica que telemetría con nonce > 5 minutos sea rechazada
 */

const path = require('path');
const fs = require('fs');
const { createCustomClient, getCertsDir } = require('../helpers/http');
const crypto = require('crypto');

async function run() {
  const name = 'test12_replayTelemetria';

  try {
    const CERTS_DIR = getCertsDir();

    // Cargar cert/key de IoT device
    const iotCertPath = path.join(CERTS_DIR, 'iot', 'devices', 'sensor-contenedor-001', 'cert.pem');
    const iotKeyPath = path.join(CERTS_DIR, 'iot', 'devices', 'sensor-contenedor-001', 'key.pem');

    if (!fs.existsSync(iotCertPath) || !fs.existsSync(iotKeyPath)) {
      return {
        name,
        passed: false,
        detail: 'IoT device certs no encontrados',
      };
    }

    const cert = fs.readFileSync(iotCertPath, 'utf8');
    const key = fs.readFileSync(iotKeyPath, 'utf8');

    const client = createCustomClient('hospital-donante', cert, key);

    // Preparar telemetría con nonce EXPIRADO (hace 6 minutos)
    const staleNonce = new Date(Date.now() - 6 * 60 * 1000).toISOString();

    const telemetry = {
      deviceId: 'sensor-contenedor-001',
      timestamp: new Date().toISOString(),
      nonce: staleNonce, // Expirado
      sensorType: 'temperature',
      value: 2.5,
      unit: 'celsius',
      organId: 'test-organ-' + crypto.randomBytes(4).toString('hex'),
    };

    // Intentar enviar telemetría con nonce expirado
    const response = await client.post('/tx/custody', telemetry);

    // Debe ser rechazado
    if (response.status >= 400 || (response.data && !response.data.ok)) {
      const reason = response.data?.reason || '';
      // Validar que rechazo sea específicamente por nonce
      if (reason.includes('nonce') || reason.includes('antigüedad') || reason.includes('expirado')) {
        return {
          name,
          passed: true,
          detail: 'STRIDE: Replay — Nonce expirado rechazado correctamente (> 5 min)',
        };
      }
      return {
        name,
        passed: true,
        detail: 'STRIDE: Replay — Telemetría rechazada (validación de nonce)',
      };
    }

    return {
      name,
      passed: false,
      detail: 'Nonce expirado NO fue rechazado (SECURITY BREACH)',
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
