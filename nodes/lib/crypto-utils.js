/**
 * Utilidades criptográficas del nodo INTEGRA.
 *
 * - Carga certificados/claves desde el volumen compartido /certs.
 * - Firma un payload con la clave privada de un actor.
 * - Verifica que una firma corresponda al certificado de un actor,
 *   y que ese certificado sea válido: no vencido y emitido por una
 *   cadena de confianza que remonta al Root CA de INTEGRA.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const forge = require("node-forge");

const CERTS_DIR = process.env.CERTS_DIR || "/certs";

function readIfExists(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

/**
 * Resuelve la ruta de certificado/clave de un "actor" identificado por su
 * nombre de organización (ej. "hospital-donante") o, para dispositivos IoT,
 * por "iot:<deviceId>" (ej. "iot:sensor-contenedor-001").
 */
function resolveActorPaths(actorId) {
  if (actorId.startsWith("iot:")) {
    const deviceId = actorId.split(":")[1];
    const dir = path.join(CERTS_DIR, "iot", "devices", deviceId);
    return { certPath: path.join(dir, "cert.pem"), keyPath: path.join(dir, "key.pem") };
  }
  const dir = path.join(CERTS_DIR, actorId);
  return { certPath: path.join(dir, "cert.pem"), keyPath: path.join(dir, "key.pem") };
}

function loadActorKeyPem(actorId) {
  const { keyPath } = resolveActorPaths(actorId);
  const pem = readIfExists(keyPath);
  if (!pem) throw new Error(`No se encontró la clave privada de "${actorId}" en ${keyPath}`);
  return pem;
}

function loadActorCertPem(actorId) {
  const { certPath } = resolveActorPaths(actorId);
  const pem = readIfExists(certPath);
  if (!pem) throw new Error(`No se encontró el certificado de "${actorId}" en ${certPath}`);
  return pem;
}

/**
 * Firma un objeto (payload) con la clave privada de un actor.
 * Devuelve la firma en base64. Firma RSA-SHA256 (ver docs/DECISIONES_DE_ALCANCE.md).
 */
function signPayload(actorId, payloadObj) {
  const keyPem = loadActorKeyPem(actorId);
  const privateKey = crypto.createPrivateKey(keyPem);
  const data = canonicalJson(payloadObj);
  const signature = crypto.sign("sha256", Buffer.from(data), privateKey);
  return signature.toString("base64");
}

/**
 * Verifica que `signatureBase64` sea una firma válida de `payloadObj`
 * hecha con la clave privada correspondiente al certificado de `actorId`.
 *
 * Además valida:
 *  - que el certificado no esté vencido,
 *  - que la cadena de confianza remonte al Root CA de INTEGRA.
 *
 * Devuelve { valid: boolean, reason?: string }
 */
function verifySignature(actorId, payloadObj, signatureBase64) {
  let certPem;
  try {
    certPem = loadActorCertPem(actorId);
  } catch (err) {
    return { valid: false, reason: err.message };
  }

  const chainCheck = verifyCertificateChain(actorId, certPem);
  if (!chainCheck.valid) return chainCheck;

  try {
    const publicKey = crypto.createPublicKey(certPem);
    const data = canonicalJson(payloadObj);
    const ok = crypto.verify("sha256", Buffer.from(data), publicKey, Buffer.from(signatureBase64, "base64"));
    if (!ok) return { valid: false, reason: `Firma inválida para actor "${actorId}"` };
    return { valid: true };
  } catch (err) {
    return { valid: false, reason: `Error verificando firma de "${actorId}": ${err.message}` };
  }
}

/**
 * Verifica vigencia y cadena de confianza de un certificado hasta el Root CA.
 */
function verifyCertificateChain(actorId, certPem) {
  const cert = forge.pki.certificateFromPem(certPem);
  const now = new Date();
  if (now < cert.validity.notBefore || now > cert.validity.notAfter) {
    return { valid: false, reason: `Certificado de "${actorId}" fuera de vigencia (expirado o aún no válido)` };
  }

  const rootPem = readIfExists(path.join(CERTS_DIR, "root-ca", "ca-cert.pem"));
  if (!rootPem) return { valid: false, reason: "No se encontró el Root CA de INTEGRA" };
  const rootCert = forge.pki.certificateFromPem(rootPem);

  let intermediatePem = null;
  if (actorId.startsWith("iot:")) {
    intermediatePem = readIfExists(path.join(CERTS_DIR, "iot", "intermediate-ca-cert.pem"));
  } else {
    intermediatePem = readIfExists(path.join(CERTS_DIR, actorId, "intermediate-ca-cert.pem"));
  }
  if (!intermediatePem) return { valid: false, reason: `No se encontró la CA intermedia para "${actorId}"` };
  const intermediateCert = forge.pki.certificateFromPem(intermediatePem);

  const caStore = forge.pki.createCaStore([rootCert]);
  try {
    forge.pki.verifyCertificateChain(caStore, [cert, intermediateCert]);
    return { valid: true };
  } catch (err) {
    return { valid: false, reason: `Cadena de confianza inválida para "${actorId}": ${err.message || err}` };
  }
}

function canonicalJson(obj) {
  // Serialización determinística simple (claves ordenadas) para que firmar
  // y verificar operen siempre sobre la misma representación de bytes.
  return JSON.stringify(sortKeysDeep(obj));
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, k) => {
        acc[k] = sortKeysDeep(value[k]);
        return acc;
      }, {});
  }
  return value;
}

module.exports = {
  signPayload,
  verifySignature,
  verifyCertificateChain,
  canonicalJson,
};
