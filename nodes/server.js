/**
 * Nodo de organización INTEGRA.
 *
 * Un mismo código sirve para las 4 organizaciones (coordinador-nacional,
 * coordinador-provincial, hospital-donante, hospital-receptor); cuál
 * organización es "este" nodo se define por la variable de entorno ORG_NAME.
 *
 * Variables de entorno:
 *   ORG_NAME        - id de esta organización (debe existir en /certs/<ORG_NAME>)
 *   PORT            - puerto HTTP (default 3000)
 *   PEERS           - lista separada por comas de URLs base de nodos pares,
 *                     ej: "http://hospital-donante:3000,http://hospital-receptor:3000"
 *   CERTS_DIR       - ruta al volumen de certificados (default /certs)
 *   LEDGER_DATA_DIR - ruta al volumen de datos del ledger (default /data)
 */

const express = require("express");
const axios = require("axios");

const { signPayload, verifySignature } = require("./lib/crypto-utils");
const ledger = require("./lib/ledger");
const { checkEndorsement } = require("./lib/endorsement");
const { queryCompatible } = require("./lib/hla-matching");

const ORG_NAME = process.env.ORG_NAME;
const PORT = process.env.PORT || 3000;
const PEERS = (process.env.PEERS || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

if (!ORG_NAME) {
  console.error("Falta la variable de entorno ORG_NAME. Abortando.");
  process.exit(1);
}

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ org: ORG_NAME, status: "ok", peers: PEERS });
});

/**
 * Enviar una transacción. El cliente debe adjuntar las firmas ya generadas
 * por cada actor requerido (ver docs/README para el flujo de firma con el
 * script cliente). Este endpoint:
 *   1) verifica criptográficamente cada firma contra el certificado del actor,
 *   2) evalúa la política de endorsement del tipo de transacción,
 *   3) si todo es válido, arma el bloque y lo agrega al ledger local,
 *   4) lo replica a los nodos pares, que lo revalidan de forma independiente.
 */
app.post("/tx/:type", async (req, res) => {
  const txType = req.params.type;
  const { payload, signatures } = req.body || {};

  if (!payload || !Array.isArray(signatures) || signatures.length === 0) {
    return res.status(400).json({ ok: false, reason: "Se requiere payload y al menos una firma" });
  }

  const result = await submitTransaction(txType, payload, signatures);
  return res.status(result.status).json(result.body);
});

/**
 * Ingesta de telemetría IoT. El dispositivo firma su lectura y la envía
 * directamente a este endpoint del nodo que tiene la custodia del órgano
 * (ej. hospital-donante mientras el traslado está en curso). El nodo
 * verifica la firma del dispositivo y co-firma como organización
 * custodiante, cumpliendo así la política de endorsement de CustodyChain
 * (firma de dispositivo IoT + endorsement de un hospital) sin que el
 * sensor tenga que gestionar credenciales de ninguna organización.
 */
app.post("/custody/ingest", async (req, res) => {
  const { payload, deviceActor, deviceSignature } = req.body || {};
  if (!payload || !deviceActor || !deviceSignature) {
    return res.status(400).json({ ok: false, reason: "Se requiere payload, deviceActor y deviceSignature" });
  }

  let hospitalSignature;
  try {
    hospitalSignature = signPayload(ORG_NAME, payload);
  } catch (err) {
    return res.status(500).json({ ok: false, reason: `No se pudo co-firmar como ${ORG_NAME}: ${err.message}` });
  }

  const signatures = [
    { actor: deviceActor, signature: deviceSignature },
    { actor: ORG_NAME, signature: hospitalSignature },
  ];

  const result = await submitTransaction("custody", payload, signatures);
  return res.status(result.status).json(result.body);
});

/**
 * Lógica común de validación + endorsement + append + replicación,
 * compartida por /tx/:type y /custody/ingest.
 */
async function submitTransaction(txType, payload, signatures) {
  const validOrgs = [];
  const invalidReasons = [];

  for (const sig of signatures) {
    if (!sig.actor || !sig.signature) {
      invalidReasons.push("Cada firma requiere { actor, signature }");
      continue;
    }
    const result = verifySignature(sig.actor, payload, sig.signature);
    if (result.valid) {
      validOrgs.push(sig.actor);
    } else {
      invalidReasons.push(result.reason);
    }
  }

  if (invalidReasons.length > 0) {
    return { status: 401, body: { ok: false, reason: "Firma(s) inválida(s)", details: invalidReasons } };
  }

  const endorsement = checkEndorsement(txType, validOrgs, payload);
  if (!endorsement.ok) {
    return { status: 403, body: { ok: false, reason: endorsement.reason } };
  }

  const block = ledger.buildNextBlock({ txType, payload, signatures });
  const appendResult = ledger.appendBlock(block);
  if (!appendResult.ok) {
    return { status: 409, body: { ok: false, reason: appendResult.reason } };
  }

  const replication = await replicateToPeers(block);
  return { status: 201, body: { ok: true, block, replication } };
}

/**
 * Recibe un bloque ya finalizado desde otro nodo y lo revalida de forma
 * completamente independiente antes de aceptarlo: recalcula el hash,
 * verifica el encadenamiento con el último bloque local, y vuelve a
 * verificar cada firma. Esto es lo que garantiza que ningún nodo pueda
 * imponer unilateralmente una versión falsa del ledger a los demás.
 */
app.post("/internal/replicate", (req, res) => {
  const { block } = req.body || {};
  if (!block) return res.status(400).json({ ok: false, reason: "Falta el bloque" });

  for (const sig of block.signatures || []) {
    const result = verifySignature(sig.actor, block.payload, sig.signature);
    if (!result.valid) {
      return res.status(401).json({ ok: false, reason: `Firma inválida al replicar: ${result.reason}` });
    }
  }

  const appendResult = ledger.appendBlock(block);
  if (!appendResult.ok) {
    return res.status(409).json({ ok: false, reason: appendResult.reason });
  }
  return res.status(201).json({ ok: true });
});

/**
 * Lectura del ledger local. Control de acceso simplificado por header
 * x-actor: el propio nodo (ORG_NAME) o un actor con rol "auditor" pueden leer.
 * Cualquier otro actor (ej. "proveedor-it") recibe 403.
 */
app.get("/ledger", (req, res) => {
  const actor = req.header("x-actor");
  const isSelf = actor === ORG_NAME;
  const isAuditor = actor === "auditor";

  if (!isSelf && !isAuditor) {
    return res.status(403).json({ ok: false, reason: `Actor "${actor || "(sin identificar)"}" no autorizado a leer este ledger` });
  }
  return res.json({ org: ORG_NAME, blocks: ledger.readLedger() });
});

/**
 * Verifica la integridad de la cadena de hashes del ledger local.
 * Útil para el test de tampering directo sobre el archivo del ledger.
 */
app.get("/verify-integrity", (req, res) => {
  res.json(ledger.verifyChainIntegrity());
});

/**
 * Motor de compatibilidad HLA (CompatibilityEngine).
 * Endpoint de solo lectura que calcula la compatibilidad entre un donante
 * y los candidatos en la lista de espera.
 *
 * No requiere firma criptográfica (es solo lectura, sin estado en el ledger).
 * Devuelve un compatibilityTimestamp que debe incluirse en la posterior
 * transacción de asignación como prueba del momento de cálculo
 * (prevención de replay).
 */
app.post("/compatibility/query", (req, res) => {
  const { donorProfile, waitingList } = req.body || {};

  if (!donorProfile || !waitingList) {
    return res.status(400).json({
      ok: false,
      reason: "Se requiere donorProfile (bloodType + hlaProfile) y waitingList",
    });
  }

  const ranked = queryCompatible(donorProfile, waitingList);
  const compatibilityTimestamp = new Date().toISOString();

  res.json({
    ok: true,
    compatibilityTimestamp,
    rankedCandidates: ranked,
  });
});

/**
 * Endpoint utilitario para que un cliente de pruebas pida a este nodo que
 * firme un payload con su propia clave (simula a un actor institucional
 * operando desde su propio nodo, en vez de manejar la clave privada fuera
 * de la organización). No expone la clave privada, solo la firma resultante.
 */
app.post("/sign", (req, res) => {
  const { payload } = req.body || {};
  if (!payload) return res.status(400).json({ ok: false, reason: "Falta el payload a firmar" });
  try {
    const signature = signPayload(ORG_NAME, payload);
    res.json({ ok: true, actor: ORG_NAME, signature });
  } catch (err) {
    res.status(500).json({ ok: false, reason: err.message });
  }
});

async function replicateToPeers(block) {
  const results = [];
  for (const peerUrl of PEERS) {
    try {
      await axios.post(`${peerUrl}/internal/replicate`, { block }, { timeout: 5000 });
      results.push({ peer: peerUrl, ok: true });
    } catch (err) {
      results.push({ peer: peerUrl, ok: false, reason: err.response?.data?.reason || err.message });
    }
  }
  return results;
}

app.listen(PORT, () => {
  console.log(`[${ORG_NAME}] nodo INTEGRA escuchando en el puerto ${PORT}. Peers: ${PEERS.join(", ") || "(ninguno)"}`);
});
