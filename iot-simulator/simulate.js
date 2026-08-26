/**
 * Simulador de sensor IoT en el contenedor de traslado del órgano.
 *
 * Cada INTERVALO_MS genera una lectura de temperatura/humedad/GPS, la firma
 * con la clave privada del dispositivo (emitida por la CA de IoT) y la
 * transmite al nodo custodiante vía POST /custody/ingest.
 *
 * Variables de entorno:
 *   DEVICE_ID         - id del dispositivo (default sensor-contenedor-001)
 *   CERTS_DIR         - ruta al volumen de certificados (default /certs)
 *   CUSTODY_NODE_URL  - URL base del nodo custodiante (ej. http://hospital-donante:3000)
 *   INTERVALO_MS      - frecuencia de envío en ms (default 5000; en el diseño
 *                       real del Paso 2 es cada 90s, acá se acelera para demo)
 *   ORGANO            - tipo de órgano transportado (default rinon)
 *   SIMULAR_FALLA_TEMP- si es "true", a mitad de la simulación fuerza una
 *                       lectura fuera de rango para disparar la alerta
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

const DEVICE_ID = process.env.DEVICE_ID || "sensor-contenedor-001";
const CERTS_DIR = process.env.CERTS_DIR || "/certs";
const CUSTODY_NODE_URL = process.env.CUSTODY_NODE_URL || "http://hospital-donante:3000";
const INTERVALO_MS = parseInt(process.env.INTERVALO_MS || "5000", 10);
const ORGANO = process.env.ORGANO || "rinon";
const SIMULAR_FALLA_TEMP = process.env.SIMULAR_FALLA_TEMP === "true";

const UMBRALES = {
  rinon: { min: 0, max: 4 },
};

const keyPath = path.join(CERTS_DIR, "iot", "devices", DEVICE_ID, "key.pem");
if (!fs.existsSync(keyPath)) {
  console.error(`No se encontró la clave del dispositivo en ${keyPath}. ¿Corriste la generación de CAs?`);
  process.exit(1);
}
const privateKeyPem = fs.readFileSync(keyPath, "utf8");
const deviceActor = `iot:${DEVICE_ID}`;

function canonicalJson(obj) {
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

function signPayload(payloadObj) {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const data = canonicalJson(payloadObj);
  return crypto.sign("sha256", Buffer.from(data), privateKey).toString("base64");
}

function generarLectura(secuencia) {
  const { min, max } = UMBRALES[ORGANO] || UMBRALES.rinon;
  let temperatura = +(min + Math.random() * (max - min)).toFixed(2);

  // A mitad de la simulación, si está activado, forzamos una lectura fuera
  // de rango para poder demostrar la alerta automática por temperatura.
  if (SIMULAR_FALLA_TEMP && secuencia === 5) {
    temperatura = +(max + 1.2).toFixed(2);
  }

  return {
    deviceId: DEVICE_ID,
    organo: ORGANO,
    secuencia,
    timestamp: new Date().toISOString(),
    temperaturaC: temperatura,
    humedadPct: +(40 + Math.random() * 10).toFixed(1),
    gps: { lat: -32.9468 + Math.random() * 0.01, lon: -60.6393 + Math.random() * 0.01 },
    fueraDeRango: temperatura < min || temperatura > max,
  };
}

async function enviarLectura(secuencia) {
  const payload = generarLectura(secuencia);
  const deviceSignature = signPayload(payload);

  try {
    const resp = await axios.post(`${CUSTODY_NODE_URL}/custody/ingest`, {
      payload,
      deviceActor,
      deviceSignature,
    });
    const alerta = payload.fueraDeRango ? "  ALERTA: temperatura fuera de rango" : "";
    console.log(
      `[IoT ${DEVICE_ID}] #${secuencia} temp=${payload.temperaturaC}C -> bloque #${resp.data.block.index} en ledger${alerta}`
    );
  } catch (err) {
    console.error(`[IoT ${DEVICE_ID}] #${secuencia} ERROR al transmitir: ${err.response?.data?.reason || err.message}`);
  }
}

console.log(`[IoT ${DEVICE_ID}] iniciando simulación. Destino: ${CUSTODY_NODE_URL}. Intervalo: ${INTERVALO_MS}ms`);

let secuencia = 0;
setInterval(() => {
  secuencia += 1;
  enviarLectura(secuencia);
}, INTERVALO_MS);
