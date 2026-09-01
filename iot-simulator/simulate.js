/**
 * Simulador de sensor IoT en el contenedor de traslado del órgano.
 *
 * Cada INTERVALO_MS genera una lectura de temperatura/humedad/GPS, la firma
 * con la clave privada del dispositivo (emitida por la CA de IoT) y la
 * transmite al nodo custodiante vía POST /custody/ingest.
 *
 * No escribe bloques hasta que exista un assignment para ORGAN_ID en el ledger
 * (inicio de trazabilidad). Docker Compose lo deja fuera del `up` por defecto
 * (profile `iot`).
 *
 * Variables de entorno:
 *   DEVICE_ID         - id del dispositivo (default sensor-contenedor-001)
 *   CERTS_DIR         - ruta al volumen de certificados (default /certs)
 *   CUSTODY_NODE_URL  - URL base del nodo custodiante
 *   INTERVALO_MS      - frecuencia de envío en ms (default 5000)
 *   ORGANO            - tipo de órgano transportado (default rinon)
 *   ORGAN_ID          - donorId del órgano en tránsito (obligatorio)
 *   SIMULAR_FALLA_TEMP- si es "true", en la lectura #5 fuerza temperatura fuera de rango
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
const ORGAN_ID = (process.env.ORGAN_ID || "").trim();
const SIMULAR_FALLA_TEMP = process.env.SIMULAR_FALLA_TEMP === "true";

if (!ORGAN_ID) {
  console.error("[IoT] Falta ORGAN_ID (donorId del órgano asignado). No se inicia telemetría.");
  process.exit(1);
}

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function esperarAsignacion() {
  const url = `${CUSTODY_NODE_URL}/dashboard/casos/${encodeURIComponent(ORGAN_ID)}`;
  console.log(`[IoT ${DEVICE_ID}] esperando assignment de ${ORGAN_ID} en ${url}`);
  for (;;) {
    try {
      const resp = await axios.get(url, {
        timeout: 4000,
        headers: { "x-actor": "hospital-donante" },
        validateStatus: () => true,
      });
      if (resp.status === 200 && resp.data?.state?.assignmentInfo) {
        console.log(`[IoT ${DEVICE_ID}] assignment encontrada. Inicio de trazabilidad de ${ORGAN_ID}.`);
        return;
      }
      const motivo = resp.status === 404 ? "caso aún no existe" : "sin assignment en el ledger";
      console.log(`[IoT ${DEVICE_ID}] ${motivo}. Reintento en 3s (no se escriben bloques).`);
    } catch (err) {
      console.log(`[IoT ${DEVICE_ID}] nodo no disponible (${err.message}). Reintento en 3s.`);
    }
    await sleep(3000);
  }
}

function generarLectura(secuencia) {
  const { min, max } = UMBRALES[ORGANO] || UMBRALES.rinon;
  let temperatura = +(min + Math.random() * (max - min)).toFixed(2);

  if (SIMULAR_FALLA_TEMP && secuencia === 5) {
    temperatura = +(max + 1.2).toFixed(2);
  }

  return {
    deviceId: DEVICE_ID,
    organo: ORGANO,
    organId: ORGAN_ID,
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
      `[IoT ${DEVICE_ID}] #${secuencia} temp=${payload.temperaturaC}C organ=${ORGAN_ID} -> bloque #${resp.data.block.index} en ledger${alerta}`
    );
  } catch (err) {
    console.error(`[IoT ${DEVICE_ID}] #${secuencia} ERROR al transmitir: ${err.response?.data?.reason || err.message}`);
  }
}

async function main() {
  console.log(
    `[IoT ${DEVICE_ID}] listo. Destino: ${CUSTODY_NODE_URL}. Intervalo: ${INTERVALO_MS}ms. organId=${ORGAN_ID}`
  );
  await esperarAsignacion();

  let secuencia = 0;
  const tick = () => {
    secuencia += 1;
    enviarLectura(secuencia);
  };
  tick();
  setInterval(tick, INTERVALO_MS);
}

main().catch((err) => {
  console.error(`[IoT ${DEVICE_ID}] fallo al iniciar: ${err.message}`);
  process.exit(1);
});
