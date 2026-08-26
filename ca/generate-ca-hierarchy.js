/**
 * INTEGRA - Generador de jerarquía de PKI
 *
 * Genera:
 *   - 1 Root CA de la red (raíz de confianza de INTEGRA)
 *   - 1 CA intermedia por cada organización (coordinador-nacional,
 *     coordinador-provincial, hospital-donante, hospital-receptor)
 *   - 1 CA intermedia dedicada a dispositivos IoT
 *   - 1 certificado "de organización" (hoja) por cada organización,
 *     firmado por su propia CA intermedia
 *   - 1 certificado de ejemplo de dispositivo IoT, firmado por la CA de IoT,
 *     con validez corta (72 horas) simulando la rotación descrita en el Paso 2
 *
 * Ver docs/DECISIONES_DE_ALCANCE.md sobre el uso de RSA-2048 en vez de
 * ECDSA P-256.
 *
 * Uso:
 *   npm install
 *   node generate-ca-hierarchy.js
 *
 * Salida: ./certs/... (o la ruta indicada en la variable de entorno CERTS_OUT)
 */

const fs = require("fs");
const path = require("path");
const forge = require("node-forge");

const pki = forge.pki;
const OUT_DIR = process.env.CERTS_OUT || path.join(__dirname, "..", "certs");

const ORGS = [
  { id: "coordinador-nacional", cn: "Coordinador Nacional INTEGRA" },
  { id: "coordinador-provincial", cn: "Coordinador Provincial INTEGRA" },
  { id: "hospital-donante", cn: "Hospital Donante INTEGRA" },
  { id: "hospital-receptor", cn: "Hospital Receptor INTEGRA" },
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function generateKeyPair() {
  // RSA-2048. Ver docs/DECISIONES_DE_ALCANCE.md punto 2.
  return forge.pki.rsa.generateKeyPair(2048);
}

function buildCert({ subjectCN, issuerCN, publicKey, isCA, validityDays, serialHex }) {
  const cert = pki.createCertificate();
  cert.publicKey = publicKey;
  cert.serialNumber = serialHex;
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + validityDays);

  const subjectAttrs = [{ name: "commonName", value: subjectCN }, { name: "organizationName", value: "INTEGRA" }];
  const issuerAttrs = [{ name: "commonName", value: issuerCN }, { name: "organizationName", value: "INTEGRA" }];

  cert.setSubject(subjectAttrs);
  cert.setIssuer(issuerAttrs);

  cert.setExtensions([
    { name: "basicConstraints", cA: isCA },
    { name: "keyUsage", keyCertSign: isCA, digitalSignature: !isCA, keyEncipherment: !isCA, cRLSign: isCA },
  ]);

  return cert;
}

function writePem(dir, filename, pem) {
  fs.writeFileSync(path.join(dir, filename), pem);
}

function main() {
  console.log(`Generando jerarquía de PKI en: ${OUT_DIR}\n`);
  ensureDir(OUT_DIR);
  let serial = 1;
  const nextSerial = () => (serial++).toString(16).padStart(2, "0");

  // ---------- 1. Root CA ----------
  console.log("[1/4] Generando Root CA de la red...");
  const rootDir = path.join(OUT_DIR, "root-ca");
  ensureDir(rootDir);

  const rootKeys = generateKeyPair();
  const rootCert = buildCert({
    subjectCN: "INTEGRA Root CA",
    issuerCN: "INTEGRA Root CA", // auto-firmado
    publicKey: rootKeys.publicKey,
    isCA: true,
    validityDays: 3650,
    serialHex: nextSerial(),
  });
  cert_sign_self(rootCert, rootKeys.privateKey);

  writePem(rootDir, "ca-key.pem", pki.privateKeyToPem(rootKeys.privateKey));
  writePem(rootDir, "ca-cert.pem", pki.certificateToPem(rootCert));

  // ---------- 2. CAs intermedias por organización ----------
  console.log("[2/4] Generando CAs intermedias de organizaciones...");
  const intermediates = {};
  for (const org of ORGS) {
    const orgDir = path.join(OUT_DIR, org.id);
    ensureDir(orgDir);

    const interKeys = generateKeyPair();
    const interCert = buildCert({
      subjectCN: `${org.cn} - Intermediate CA`,
      issuerCN: "INTEGRA Root CA",
      publicKey: interKeys.publicKey,
      isCA: true,
      validityDays: 1825,
      serialHex: nextSerial(),
    });
    interCert.sign(rootKeys.privateKey, forge.md.sha256.create());

    writePem(orgDir, "intermediate-ca-key.pem", pki.privateKeyToPem(interKeys.privateKey));
    writePem(orgDir, "intermediate-ca-cert.pem", pki.certificateToPem(interCert));

    intermediates[org.id] = { keys: interKeys, cert: interCert };
    console.log(`   - ${org.id}: CA intermedia OK`);
  }

  // ---------- 3. Certificado "de organización" (hoja) por cada org ----------
  console.log("[3/4] Emitiendo certificados de organización (hoja)...");
  for (const org of ORGS) {
    const orgDir = path.join(OUT_DIR, org.id);
    const { keys: interKeys, cert: interCert } = intermediates[org.id];

    const leafKeys = generateKeyPair();
    const leafCert = buildCert({
      subjectCN: org.cn,
      issuerCN: interCert.subject.getField("CN").value,
      publicKey: leafKeys.publicKey,
      isCA: false,
      validityDays: 365,
      serialHex: nextSerial(),
    });
    leafCert.sign(interKeys.privateKey, forge.md.sha256.create());

    writePem(orgDir, "key.pem", pki.privateKeyToPem(leafKeys.privateKey));
    writePem(orgDir, "cert.pem", pki.certificateToPem(leafCert));
    // Cadena completa: hoja + intermedia + root (útil para verificación)
    writePem(
      orgDir,
      "chain.pem",
      pki.certificateToPem(leafCert) + pki.certificateToPem(interCert) + pki.certificateToPem(rootCert)
    );
    console.log(`   - ${org.id}: certificado de organización OK (365 días)`);
  }

  // ---------- 4. CA de IoT + certificado de dispositivo de ejemplo ----------
  console.log("[4/4] Generando CA de IoT y certificado de dispositivo de ejemplo...");
  const iotDir = path.join(OUT_DIR, "iot");
  ensureDir(iotDir);

  const iotCaKeys = generateKeyPair();
  const iotCaCert = buildCert({
    subjectCN: "INTEGRA IoT Devices CA",
    issuerCN: "INTEGRA Root CA",
    publicKey: iotCaKeys.publicKey,
    isCA: true,
    validityDays: 1825,
    serialHex: nextSerial(),
  });
  iotCaCert.sign(rootKeys.privateKey, forge.md.sha256.create());
  writePem(iotDir, "intermediate-ca-key.pem", pki.privateKeyToPem(iotCaKeys.privateKey));
  writePem(iotDir, "intermediate-ca-cert.pem", pki.certificateToPem(iotCaCert));

  const deviceId = "sensor-contenedor-001";
  const deviceDir = path.join(iotDir, "devices", deviceId);
  ensureDir(deviceDir);

  const deviceKeys = generateKeyPair();
  const deviceCert = buildCert({
    subjectCN: deviceId,
    issuerCN: "INTEGRA IoT Devices CA",
    publicKey: deviceKeys.publicKey,
    isCA: false,
    validityDays: 3, // TTL corto de 72h, ver Paso 2 - rotación de credenciales IoT
    serialHex: nextSerial(),
  });
  deviceCert.sign(iotCaKeys.privateKey, forge.md.sha256.create());

  writePem(deviceDir, "key.pem", pki.privateKeyToPem(deviceKeys.privateKey));
  writePem(deviceDir, "cert.pem", pki.certificateToPem(deviceCert));
  writePem(
    deviceDir,
    "chain.pem",
    pki.certificateToPem(deviceCert) + pki.certificateToPem(iotCaCert) + pki.certificateToPem(rootCert)
  );
  console.log(`   - ${deviceId}: certificado de dispositivo OK (72 horas de validez)`);

  console.log("\nJerarquía de PKI generada correctamente.");
  console.log(`Root CA:        ${path.join(rootDir, "ca-cert.pem")}`);
  console.log(`Organizaciones: ${ORGS.map((o) => o.id).join(", ")}`);
  console.log(`IoT:            ${deviceDir}`);
}

function cert_sign_self(cert, privateKey) {
  cert.sign(privateKey, forge.md.sha256.create());
}

main();
