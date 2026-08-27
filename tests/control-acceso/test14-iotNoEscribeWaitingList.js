/**
 * Test 14: STRIDE Elevation of Privilege - IoT device no puede escribir en waiting-list
 * Verifica que roles estén separados (IoT solo puede hacer telemetría)
 */

const path = require('path');
const fs = require('fs');
const { createCustomClient, getCertsDir } = require('../helpers/http');
const crypto = require('crypto');

async function run() {
  const name = 'test14_iotNoEscribeWaitingList';

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

    // Preparar payload para waiting-list
    const payload = {
      payload: {
        patientId: 'test-patient-' + crypto.randomBytes(4).toString('hex'),
        bloodType: 'O+',
        hlaProfile: { A: 'A2', B: 'B7', DR: 'DR4' },
        urgencyLevel: 3,
      },
    };

    // Intentar firmar (como waiting-list actor)
    const signResponse = await client.post('/sign', payload);
    if (!signResponse.data || !signResponse.data.signature) {
      return {
        name,
        passed: false,
        detail: 'No se obtuvo firma del dispositivo IoT',
      };
    }

    // Intentar enviar transacción a waiting-list
    const txPayload = {
      payload: payload.payload,
      signatures: [
        { actor: 'iot:sensor-contenedor-001', signature: signResponse.data.signature },
      ],
    };

    const txResponse = await client.post('/tx/waiting-list', txPayload);

    // Debe ser rechazado (IoT no autorizado para waiting-list)
    if (txResponse.status >= 400 || (txResponse.data && !txResponse.data.ok)) {
      const reason = txResponse.data?.reason || '';
      if (reason.includes('coordinador-nacional') || reason.includes('autorizado')) {
        return {
          name,
          passed: true,
          detail: 'STRIDE: EoP — IoT bloqueado de escribir en waiting-list',
        };
      }
      return {
        name,
        passed: true,
        detail: 'STRIDE: EoP — IoT rechazado en waiting-list (validación de rol)',
      };
    }

    return {
      name,
      passed: false,
      detail: 'IoT NO fue bloqueado de escribir waiting-list (SECURITY BREACH)',
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
