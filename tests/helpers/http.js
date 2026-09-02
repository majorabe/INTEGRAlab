/**
 * Wrapper de axios para los endpoints de INTEGRA
 * Soporta certificados de cliente TLS y basURLs configurables por nodo
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Determine CERTS_DIR: first try env var, then local relative path, then /certs
let CERTS_DIR = process.env.CERTS_DIR;
if (!CERTS_DIR) {
  const localCerts = path.join(__dirname, '../../certs');
  CERTS_DIR = fs.existsSync(localCerts) ? localCerts : '/certs';
}

function buildNodeUrls() {
  if (process.env.INTEGRA_NODES_HOST_MODE === 'compose') {
    return {
      'coordinador-nacional': 'http://coordinador-nacional:3000',
      'coordinador-provincial': 'http://coordinador-provincial:3000',
      'hospital-donante': 'http://hospital-donante:3000',
      'hospital-receptor': 'http://hospital-receptor:3000',
    }
  }
  const host = process.env.INTEGRA_NODES_HOST || 'localhost'
  return {
    'coordinador-nacional': `http://${host}:3001`,
    'coordinador-provincial': `http://${host}:3002`,
    'hospital-donante': `http://${host}:3003`,
    'hospital-receptor': `http://${host}:3004`,
  }
}

const NODES = buildNodeUrls()

/**
 * Crea un cliente axios configurado para un nodo específico
 * @param {string} nodeName - nombre del nodo (ej. 'coordinador-nacional')
 * @param {Object} tlsOptions - opciones TLS (cert, key, ca) [opcional]
 */
function createClient(nodeName, tlsOptions = {}) {
  const baseURL = NODES[nodeName];
  if (!baseURL) throw new Error(`Nodo desconocido: ${nodeName}`);

  const config = {
    baseURL,
    timeout: 5000,
    validateStatus: () => true, // No throw en ningún status; los tests chequean explícitamente
  };

  // Si se proporcionan opciones TLS, configurar agent HTTPS
  if (tlsOptions.cert || tlsOptions.key) {
    config.httpsAgent = new https.Agent({
      cert: tlsOptions.cert,
      key: tlsOptions.key,
      ca: tlsOptions.ca,
      rejectUnauthorized: false, // para tests, permitir certs autofirmados
    });
  }

  return axios.create(config);
}

/**
 * Cliente para un nodo con su cert/key legítimo
 * @param {string} nodeName - nombre del nodo
 */
function createAuthenticatedClient(nodeName) {
  const certPath = path.join(CERTS_DIR, nodeName, 'cert.pem');
  const keyPath = path.join(CERTS_DIR, nodeName, 'key.pem');

  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    throw new Error(`Certificados no encontrados para ${nodeName}`);
  }

  const cert = fs.readFileSync(certPath, 'utf8');
  const key = fs.readFileSync(keyPath, 'utf8');

  return createClient(nodeName, { cert, key });
}

/**
 * Cliente con cert/key personalizados (ej. para spoofing o expirados)
 */
function createCustomClient(nodeName, customCert, customKey) {
  return createClient(nodeName, { cert: customCert, key: customKey });
}

/**
 * Helper para esperar a que el stack esté listo
 * Intenta hacer GET /health en los 4 nodos cada 2s, máx 60s
 */
async function waitForStack() {
  const maxRetries = 30;
  const retryInterval = 2000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const results = await Promise.all(
        Object.entries(NODES).map(([name, url]) =>
          axios.get(`${url}/health`, { timeout: 1000 }).catch(() => null)
        )
      );
      if (results.every(r => r && r.status === 200)) {
        console.log('✓ Stack listo (todos los 4 nodos responden)');
        return;
      }
    } catch (err) {
      // Ignorar errores, reintentar
    }
    console.log(`⏳ Esperando stack... (${i + 1}/${maxRetries})`);
    await new Promise(resolve => setTimeout(resolve, retryInterval));
  }

  throw new Error('Stack no está listo después de 60s');
}

/**
 * Get the correct CERTS_DIR path for the current environment
 */
function getCertsDir() {
  return CERTS_DIR;
}

module.exports = {
  createClient,
  createAuthenticatedClient,
  createCustomClient,
  waitForStack,
  getCertsDir,
  NODES,
};
