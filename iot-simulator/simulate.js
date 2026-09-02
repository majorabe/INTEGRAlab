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
 *   LECTURAS_MAX      - tope de lecturas (default 8). El traslado se cierra con `reception`.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const axios = require("axios");

const DEVICE_ID = process.env.DEVICE_ID || "sensor-contenedor-001";
const CERTS_DIR = process.env.CERTS_DIR || "/certs";
const CUSTODY_NODE_URL = process.env.CUSTODY_NODE_URL || "http://hospital-donante:3000";

const INTERVALO_MS = parseInt(process.env.INTERVALO_MS || "5000", 10);
const ORGANO = process.env.ORGANO || "rinon";
const ORGAN_ID = (process.env.ORGAN_ID || "").trim();
const SIMULAR_FALLA_TEMP = process.env.SIMULAR_FALLA_TEMP === "true";
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || "3010", 10);
const LECTURAS_MAX = parseInt(process.env.LECTURAS_MAX || "8", 10);

const iotStatus = {
  deviceId: DEVICE_ID,
  organId: ORGAN_ID,
  phase: "esperando-assignment",
  lastSequence: 0,
  lastTempC: null,
  lastError: null,
  startedAt: new Date().toISOString(),
};

function startHealthServer() {
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Content-Type", "application/json");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = req.url || "/";
    if (url === "/health" || url === "/") {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          ok: true,
          service: "iot-simulator",
          container: "iot-simulator",
          ...iotStatus,
        })
      );
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ ok: false }));
  });
  server.listen(HEALTH_PORT, "0.0.0.0", () => {
    console.log(`[IoT ${DEVICE_ID}] health en :${HEALTH_PORT}`);
  });
}

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

async function consultarCaso() {
  const url = `${CUSTODY_NODE_URL}/dashboard/casos/${encodeURIComponent(ORGAN_ID)}`;
  const resp = await axios.get(url, {
    timeout: 4000,
    headers: { "x-actor": "hospital-donante" },
    validateStatus: () => true,
  });
  return resp;
}

async function esperarAsignacion() {
  console.log(`[IoT ${DEVICE_ID}] esperando assignment de ${ORGAN_ID}`);
  for (;;) {
    try {
      const resp = await consultarCaso();
      if (resp.status === 200 && resp.data?.state?.receptionInfo) {
        iotStatus.phase = "entregado";
        iotStatus.lastError = null;
        console.log(`[IoT ${DEVICE_ID}] el órgano ya fue recibido. No se escribe telemetría.`);
        return "recibido";
      }
      if (resp.status === 200 && resp.data?.state?.assignmentInfo) {
        iotStatus.phase = "escribiendo";
        iotStatus.lastError = null;
        console.log(`[IoT ${DEVICE_ID}] assignment encontrada. Inicio de trazabilidad de ${ORGAN_ID}.`);
        return "asignado";
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
    iotStatus.phase = "escribiendo";
    iotStatus.lastSequence = secuencia;
    iotStatus.lastTempC = payload.temperaturaC;
    iotStatus.lastError = null;
    console.log(
      `[IoT ${DEVICE_ID}] #${secuencia} temp=${payload.temperaturaC}C organ=${ORGAN_ID} -> bloque #${resp.data.block.index} en ledger${alerta}`
    );
    return "ok";
  } catch (err) {
    const reason = err.response?.data?.reason || err.message;
    iotStatus.lastError = reason;
    console.error(`[IoT ${DEVICE_ID}] #${secuencia} ERROR al transmitir: ${reason}`);
    if (err.response?.status === 409 && /recibido|cerrado/i.test(reason)) {
      return "cerrado";
    }
    return "error";
  }
}

async function trasladoCerrado() {
  try {
    const resp = await consultarCaso();
    return Boolean(resp.status === 200 && resp.data?.state?.receptionInfo);
  } catch {
    return false;
  }
}

async function main() {
  startHealthServer();
  console.log(
    `[IoT ${DEVICE_ID}] listo. Destino: ${CUSTODY_NODE_URL}. Intervalo: ${INTERVALO_MS}ms. organId=${ORGAN_ID}`
  );
  const inicio = await esperarAsignacion();
  if (inicio === "recibido") return;

  let secuencia = 0;
  while (secuencia < LECTURAS_MAX) {
    if (await trasladoCerrado()) {
      iotStatus.phase = "entregado";
      iotStatus.lastError = null;
      console.log(`[IoT ${DEVICE_ID}] recepción en el ledger. Fin de telemetría.`);
      return;
    }
    secuencia += 1;
    const result = await enviarLectura(secuencia);
    if (result === "cerrado") {
      iotStatus.phase = "entregado";
      console.log(`[IoT ${DEVICE_ID}] traslado cerrado. No se envían más lecturas.`);
      return;
    }
    await sleep(INTERVALO_MS);
  }

  iotStatus.phase = "en-destino";
  console.log(`[IoT ${DEVICE_ID}] tope de ${LECTURAS_MAX} lecturas. Esperando recepción en el hospital.`);
  for (;;) {
    if (await trasladoCerrado()) {
      iotStatus.phase = "entregado";
      iotStatus.lastError = null;
      console.log(`[IoT ${DEVICE_ID}] órgano recibido. Circuito de trazabilidad cerrado.`);
      return;
    }
    await sleep(3000);
  }
}

main().catch((err) => {
  console.error(`[IoT ${DEVICE_ID}] fallo al iniciar: ${err.message}`);
  process.exit(1);
});
