/**
 * Helpers para generar certificados "malos" para tests de seguridad
 * Usa node-forge para generar certs en memoria sin tocar la CA de producción
 */

const forge = require('node-forge');
const https = require('https');

/**
 * Genera un certificado autofirmado (NOT emitido por ninguna CA de INTEGRA)
 * Para probar rechazo de spoofing (test02)
 */
function generateSelfSignedCert() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);

  cert.setSubject([
    { name: 'commonName', value: 'rogue-actor' },
    { name: 'organizationName', value: 'Attacker Corp' },
  ]);
  cert.setIssuer(cert.subject);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
  ]);

  // Auto-firmar
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

  return { cert: certPem, key: keyPem };
}

/**
 * Genera un certificado con fecha de expiración en el pasado
 * Para probar validación de vigencia (test03 — REQUIERE CHECKPOINT)
 */
function generateExpiredCert(orgName = 'hospital-donante') {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '02';

  // Validez: hace 2 días hasta hace 1 día
  const notBefore = new Date();
  notBefore.setDate(notBefore.getDate() - 2);
  const notAfter = new Date();
  notAfter.setDate(notAfter.getDate() - 1);

  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  cert.setSubject([
    { name: 'commonName', value: orgName },
    { name: 'organizationName', value: orgName },
  ]);
  cert.setIssuer(cert.subject);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

  return { cert: certPem, key: keyPem };
}

/**
 * Genera un certificado válido pero con OU de otra organización
 * Para probar que se valida el rol/org del cert contra la acción (test04)
 */
function generateWrongOrgCert(spoofedOrg = 'coordinador-nacional') {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '03';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);

  // Subject dice ser coordinador-nacional pero no está firmado por su CA
  cert.setSubject([
    { name: 'commonName', value: spoofedOrg },
    { name: 'organizationName', value: spoofedOrg },
  ]);
  cert.setIssuer(cert.subject);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

  return { cert: certPem, key: keyPem };
}

/**
 * Genera un certificado IoT válido pero de otro dispositivo
 * Para probar que /custody/ingest valida cert de la CA IoT específicamente (test11)
 */
function generateWrongIoTCert(fakeDeviceId = 'fake-device-001') {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '04';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);

  // Subject dice ser un dispositivo IoT pero autofirmado (no de la CA IoT)
  cert.setSubject([
    { name: 'commonName', value: `iot:${fakeDeviceId}` },
    { name: 'organizationName', value: 'Fake IoT' },
  ]);
  cert.setIssuer(cert.subject);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

  return { cert: certPem, key: keyPem };
}

module.exports = {
  generateSelfSignedCert,
  generateExpiredCert,
  generateWrongOrgCert,
  generateWrongIoTCert,
};
