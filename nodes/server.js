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
const { queryCase, getHealthSummary } = require("./lib/dashboard-projection");

const ORG_NAME = process.env.ORG_NAME;
const PORT = process.env.PORT || 3000;
const PEERS = (process.env.PEERS || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

/**
 * IS_ORDERER: Rol de este nodo en la arquitectura de ordenamiento.
 *
 * Fase 3-4 Spec (Ordenamiento Global):
 * - coordinador-nacional: IS_ORDERER=true → recibe transacciones, crea bloques únicos, replica
 * - otros nodos: IS_ORDERER=false → validan endorsement localmente, reenvían a orderer
 *
 * Esto previene fork de multi-origen: todos los bloques pasan por coordinador-nacional,
 * que es la autoridad central de ordenamiento (análogo a Raft con líder fijo).
 * Elección dinámica de líder será Fase posterior.
 */
const IS_ORDERER = process.env.IS_ORDERER === 'true' || false;

/**
 * ORDERER_URL: URL del nodo ordenador único (coordinador-nacional).
 * Usado por non-orderers para reenviar transacciones.
 */
const ORDERER_URL = process.env.ORDERER_URL || 'http://coordinador-nacional:3000';

/**
 * QUORUM_NODOS: Requerimiento de replicación exitosa para confirmar transacción.
 *
 * Relación con endorsement (Paso 2, Tabla 2):
 * - Endorsement de negocio: 2 organizaciones deben firmar (capa aplicación)
 * - Quorum de red: 3 de 4 nodos deben confirmar replicación (capa infraestructura)
 *
 * Tolerancia a fallos: 1 nodo puede estar caído sin bloquear transacciones.
 * Con 4 nodos totales: 1 (local) + 2 (replicación exitosa) = 3 ✓ QUORUM
 */
const QUORUM_NODOS = 3;

/**
 * INTERNAL_TOKEN: Autenticación nodo-a-nodo para endpoints /internal/*
 * Evita que un atacante externo inyecte bloques falsificados.
 * Compartido entre los 4 nodos vía variable de entorno (INTERNAL_TOKEN).
 */
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || 'default-insecure-token-change-in-prod';

if (!ORG_NAME) {
  console.error("Falta la variable de entorno ORG_NAME. Abortando.");
  process.exit(1);
}

const app = express();
app.use(express.json());

/**
 * Middleware de autenticación para endpoints /internal/*
 * Protege contra inyección de bloques desde atacantes externos.
 */
app.use('/internal', (req, res, next) => {
  const token = req.header('X-Internal-Token');
  if (token !== INTERNAL_TOKEN) {
    return res.status(401).json({ ok: false, reason: 'Unauthorized' });
  }
  next();
});

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
 *
 * FASE 3-4: También respeta la bifurcación IS_ORDERER
 * - Si IS_ORDERER=true: procesa localmente (hospital tiene autoridad)
 * - Si IS_ORDERER=false: reenvía a coordinador-nacional (pero esto está
 *   documentado como pendiente — hoy el IoT simulator escribe directo a
 *   hospital-donante sin pasar por orderer)
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
 * Lógica común de validación + endorsement + replicación + append.
 *
 * FASE 3-4: ORDENAMIENTO GLOBAL (Paso 2)
 *
 * BIFURCACIÓN POR IS_ORDERER:
 *
 * Si IS_ORDERER=true (coordinador-nacional):
 *   1. Verificar firmas de endorsement (capa negocio)
 *   2. Verificar política de endorsement (capa negocio)
 *   3. Construir bloque con índice único (autoridad central)
 *   4. INTENTAR REPLICAR a peers ANTES de persistir localmente
 *   5. Contar votos: 1 (local) + peers confirmados
 *   6. Si votos >= QUORUM_NODOS → persistir + 201 éxito
 *   7. Si votos < QUORUM_NODOS → NO persistir + 503 sin quorum
 *
 * Si IS_ORDERER=false (otros nodos):
 *   1. Verificar firmas de endorsement (capa negocio)
 *   2. Verificar política de endorsement (capa negocio)
 *   3. Reenviar a /internal/order-and-replicate del orderer
 *   4. Devolver respuesta del orderer al cliente
 *
 * Esto previene fork de multi-origen: todas las transacciones pasan por
 * coordinador-nacional, que es la autoridad de ordenamiento (Fase 1).
 */
async function submitTransaction(txType, payload, signatures) {
  const validOrgs = [];
  const invalidReasons = [];

  console.log(`[${ORG_NAME}] submitTransaction: txType=${txType}, sigCount=${signatures?.length || 0}, isOrderer=${IS_ORDERER}`);

  // PASO COMÚN 1: Verificar firmas (capa negocio)
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

  // PASO COMÚN 2: Verificar endorsement (capa negocio)
  const endorsement = checkEndorsement(txType, validOrgs, payload);
  if (!endorsement.ok) {
    return { status: 403, body: { ok: false, reason: endorsement.reason } };
  }

  // BIFURCACIÓN: IS_ORDERER
  if (IS_ORDERER) {
    // ===== ORDERER LOGIC (coordinador-nacional) =====
    console.log(`[${ORG_NAME}] ORDERER LOGIC: creando bloque localmente`);

    // PASO 3: Construir bloque (pendiente persistencia)
    const block = ledger.buildNextBlock({ txType, payload, signatures, validOrgs });

    // PASO 4: Intentar replicar ANTES de persistir (capa infraestructura)
    const replication = await replicateToPeers(block);

    // PASO 5: Contar votos
    const successfulPeers = replication.filter(r => r.ok).length;
    const totalVotes = 1 + successfulPeers;

    console.log(`[${ORG_NAME}] QUORUM DEBUG: txType=${txType}, successfulPeers=${successfulPeers}, totalVotes=${totalVotes}, QUORUM_NODOS=${QUORUM_NODOS}, condition (totalVotes >= QUORUM_NODOS) = ${totalVotes >= QUORUM_NODOS}`);

    // PASO 6-7: Decisión por quorum
    if (totalVotes >= QUORUM_NODOS) {
      // Quorum alcanzado → persistir localmente y confirmar al cliente
      const appendResult = await ledger.appendBlock(block);
      if (!appendResult.ok) {
        return { status: 409, body: { ok: false, reason: appendResult.reason } };
      }
      return {
        status: 201,
        body: {
          ok: true,
          block,
          replication,
          quorum: { votes: totalVotes, required: QUORUM_NODOS, status: "PASSED" }
        }
      };
    } else {
      // Quorum NO alcanzado → NO persistir, rechazar transacción
      return {
        status: 503,
        body: {
          ok: false,
          reason: `No se alcanzó quorum de red: ${totalVotes}/${QUORUM_NODOS} nodos confirmaron replicación`,
          replication,
          quorum: { votes: totalVotes, required: QUORUM_NODOS, status: "FAILED" }
        }
      };
    }
  } else {
    // ===== NON-ORDERER LOGIC (otros nodos) =====
    console.log(`[${ORG_NAME}] NON-ORDERER LOGIC: reenviando a orderer en ${ORDERER_URL}`);

    try {
      // Preparar bloque sin persistir (solo para validación en orderer)
      const block = ledger.buildNextBlock({ txType, payload, signatures, validOrgs });

      // Reenviar al orderer
      const ordererResponse = await axios.post(
        `${ORDERER_URL}/internal/order-and-replicate`,
        { block, nonOrdererOrg: ORG_NAME },
        {
          timeout: 10000,
          headers: { 'X-Internal-Token': INTERNAL_TOKEN }
        }
      );

      // Devolver respuesta del orderer al cliente
      return {
        status: ordererResponse.status || 201,
        body: ordererResponse.data
      };
    } catch (err) {
      console.error(`[${ORG_NAME}] Error reenviando a orderer:`, err.message);
      return {
        status: err.response?.status || 503,
        body: {
          ok: false,
          reason: err.response?.data?.reason || `No se pudo contactar al orderer: ${err.message}`
        }
      };
    }
  }
}

/**
 * Recibe un bloque ya finalizado desde otro nodo y lo revalida de forma
 * completamente independiente antes de aceptarlo: recalcula el hash,
 * verifica el encadenamiento con el último bloque local, y vuelve a
 * verificar cada firma. Esto es lo que garantiza que ningún nodo pueda
 * imponer unilateralmente una versión falsa del ledger a los demás.
 *
 * SEGURIDAD (Fase 3-4):
 * - Verifica que las firmas coincidan exactamente con endorsedBy
 * - Revalida la política de endorsement
 * - Detecta intentos de reemplazar firmas con otra combinación válida
 */
app.post("/internal/replicate", async (req, res) => {
  const { block } = req.body || {};
  if (!block) return res.status(400).json({ ok: false, reason: "Falta el bloque" });

  // PASO 1: Verificar firmas criptográficas
  for (const sig of block.signatures || []) {
    const result = verifySignature(sig.actor, block.payload, sig.signature);
    if (!result.valid) {
      return res.status(401).json({ ok: false, reason: `Firma inválida al replicar: ${result.reason}` });
    }
  }

  // PASO 2: Verificar que los actores que firmaron sean exactamente los endosados
  const actualActors = (block.signatures || []).map(sig => sig.actor).sort();
  const expectedActors = (block.endorsedBy || []).sort();

  console.log(`[${ORG_NAME}] /internal/replicate: txType=${block.txType}, actualActors=[${actualActors.join(',')}], expectedActors=[${expectedActors.join(',')}]`);

  if (JSON.stringify(actualActors) !== JSON.stringify(expectedActors)) {
    console.log(`[${ORG_NAME}] REPLICATE FAILED: endorsedBy mismatch`);
    return res.status(403).json({
      ok: false,
      reason: `Actores que firmaron no coinciden con endorsedBy. ` +
              `Esperado: ${expectedActors.join(', ')}, ` +
              `Recibido: ${actualActors.join(', ')}`
    });
  }

  // PASO 3: Revalidar política de endorsement
  const endorsement = checkEndorsement(block.txType, actualActors, block.payload);
  if (!endorsement.ok) {
    return res.status(403).json({
      ok: false,
      reason: `Política de endorsement no cumplida al replicar: ${endorsement.reason}`
    });
  }

  // PASO 4: Validar estructura del bloque (prevHash, encadenamiento, hash)
  const appendResult = await ledger.appendBlock(block);
  if (!appendResult.ok) {
    return res.status(409).json({ ok: false, reason: appendResult.reason });
  }
  return res.status(201).json({ ok: true });
});

/**
 * ENDPOINT ORDERER: /internal/order-and-replicate
 *
 * FASE 3-4 (Paso 2): Ordenamiento Global
 *
 * Solo disponible en coordinador-nacional (IS_ORDERER=true).
 * Recibe bloques pre-construidos desde non-orderers, los revalida,
 * y los replica a todos los peers. Esto garantiza que TODOS los
 * bloques cruzarán por coordinador-nacional, previniendo fork de
 * multi-origen.
 *
 * Flujo:
 * 1. Non-orderer recibe POST /tx/:type, valida endorsement localmente
 * 2. Non-orderer reenvía a coordinador-nacional /internal/order-and-replicate
 * 3. Coordinador-nacional revalida endorsement (defensa profunda)
 * 4. Coordinador-nacional construye bloque con índice único
 * 5. Coordinador-nacional replica a los 3 peers
 * 6. Coordinador-nacional persiste localmente si quorum >= 3
 * 7. Coordinador-nacional responde al non-orderer
 * 8. Non-orderer responde al cliente original
 */
app.post("/internal/order-and-replicate", async (req, res) => {
  if (!IS_ORDERER) {
    return res.status(403).json({
      ok: false,
      reason: "Este endpoint solo está disponible en el ordenador (coordinador-nacional)"
    });
  }

  const { block, nonOrdererOrg } = req.body || {};
  if (!block) return res.status(400).json({ ok: false, reason: "Falta el bloque" });

  console.log(`[${ORG_NAME}] ORDERER: recibido bloque desde ${nonOrdererOrg}, txType=${block.txType}`);

  // DEFENSA PROFUNDA: Revalidar todas las firmas
  for (const sig of block.signatures || []) {
    const result = verifySignature(sig.actor, block.payload, sig.signature);
    if (!result.valid) {
      return res.status(401).json({
        ok: false,
        reason: `Firma inválida en orden-and-replicate: ${result.reason}`
      });
    }
  }

  // Verificar que los actores que firmaron sean exactamente los endosados
  const actualActors = (block.signatures || []).map(sig => sig.actor).sort();
  const expectedActors = (block.endorsedBy || []).sort();

  if (JSON.stringify(actualActors) !== JSON.stringify(expectedActors)) {
    return res.status(403).json({
      ok: false,
      reason: `Actores que firmaron no coinciden con endorsedBy en order-and-replicate`
    });
  }

  // Revalidar política de endorsement
  const endorsement = checkEndorsement(block.txType, actualActors, block.payload);
  if (!endorsement.ok) {
    return res.status(403).json({
      ok: false,
      reason: `Política de endorsement no cumplida en order-and-replicate: ${endorsement.reason}`
    });
  }

  // CRÍTICO: El ORDERER construye su propio bloque con índice único (no usa el del non-orderer)
  // Esto garantiza que el índice corresponde al ledger del ordenador, no al del non-orderer
  const ordererBlock = ledger.buildNextBlock({
    txType: block.txType,
    payload: block.payload,
    signatures: block.signatures,
    validOrgs: actualActors  // Usar los actores validados
  });

  console.log(`[${ORG_NAME}] ORDERER: construido bloque con índice=${ordererBlock.index}, txType=${ordererBlock.txType}`);

  // EL ORDERER REPLICA A LOS PEERS (con su propio bloque)
  const replication = await replicateToPeers(ordererBlock);

  // Contar votos
  const successfulPeers = replication.filter(r => r.ok).length;
  const totalVotes = 1 + successfulPeers;

  console.log(`[${ORG_NAME}] ORDERER QUORUM: txType=${ordererBlock.txType}, votes=${totalVotes}/${QUORUM_NODOS}`);

  // Decisión por quorum
  if (totalVotes >= QUORUM_NODOS) {
    // Quorum alcanzado → persistir localmente
    const appendResult = await ledger.appendBlock(ordererBlock);
    if (!appendResult.ok) {
      return res.status(409).json({ ok: false, reason: appendResult.reason });
    }
    return res.status(201).json({
      ok: true,
      block: ordererBlock,
      replication,
      quorum: { votes: totalVotes, required: QUORUM_NODOS, status: "PASSED" }
    });
  } else {
    // Quorum NO alcanzado → NO persistir
    return res.status(503).json({
      ok: false,
      reason: `No se alcanzó quorum de red en orderer: ${totalVotes}/${QUORUM_NODOS}`,
      replication,
      quorum: { votes: totalVotes, required: QUORUM_NODOS, status: "FAILED" }
    });
  }
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

/**
 * Dashboard: Consolidated case state projection
 * GET /dashboard/casos/:id
 *
 * Returns consolidated view of a case (donor or recipient) with:
 * - donorInfo: donor registry data
 * - recipientInfo: patient waiting list data
 * - assignmentInfo: organ assignment
 * - custodyCheckpoints: telemetry during transport
 *
 * Access control: x-actor header must be self, auditor, or coordinador
 */
app.get("/dashboard/casos/:id", (req, res) => {
  const actor = req.header("x-actor");
  const caseId = req.params.id;

  // Access control: allow self, auditor, and coordinators
  const isAuthorized = actor === ORG_NAME || actor === "auditor" ||
                       actor === "coordinador-nacional" || actor === "coordinador-provincial";

  if (!isAuthorized) {
    return res.status(403).json({
      ok: false,
      reason: `Actor "${actor || "(sin identificar)"}" no autorizado a consultar dashboard`,
    });
  }

  const caseData = queryCase(ledger.readLedger(), caseId);
  if (!caseData.found) {
    return res.status(404).json({ ok: false, reason: caseData.reason });
  }

  res.json({ ok: true, ...caseData });
});

/**
 * Dashboard: Timeline of events for a case
 * GET /dashboard/casos/:id/timeline
 *
 * Returns ordered list of all transactions affecting the case with:
 * - timestamp, type (donor-registry|waiting-list|assignment|custody)
 * - action (human-readable summary)
 * - actors (which organizations co-signed)
 * - hash (shortened for display, fullHash available)
 * - payloadSummary (relevant fields only)
 */
app.get("/dashboard/casos/:id/timeline", (req, res) => {
  const actor = req.header("x-actor");
  const caseId = req.params.id;

  const isAuthorized = actor === ORG_NAME || actor === "auditor" ||
                       actor === "coordinador-nacional" || actor === "coordinador-provincial";

  if (!isAuthorized) {
    return res.status(403).json({
      ok: false,
      reason: `Actor "${actor || "(sin identificar)"}" no autorizado a consultar dashboard`,
    });
  }

  const caseData = queryCase(ledger.readLedger(), caseId);
  if (!caseData.found) {
    return res.status(404).json({ ok: false, reason: caseData.reason });
  }

  res.json({
    ok: true,
    caseId,
    timeline: caseData.timeline,
    eventCount: caseData.timeline.length,
  });
});

/**
 * Dashboard: Telemetry time series for a case
 * GET /dashboard/casos/:id/telemetria
 *
 * Returns chronologically-ordered sensor readings from custody chain:
 * - timestamp (when reading was recorded)
 * - deviceId (IoT sensor identifier)
 * - sensorType (temperature, humidity, etc.)
 * - value and unit (temperature: 2.5°C, etc.)
 */
app.get("/dashboard/casos/:id/telemetria", (req, res) => {
  const actor = req.header("x-actor");
  const caseId = req.params.id;

  const isAuthorized = actor === ORG_NAME || actor === "auditor" ||
                       actor === "coordinador-nacional" || actor === "coordinador-provincial";

  if (!isAuthorized) {
    return res.status(403).json({
      ok: false,
      reason: `Actor "${actor || "(sin identificar)"}" no autorizado a consultar dashboard`,
    });
  }

  const caseData = queryCase(ledger.readLedger(), caseId);
  if (!caseData.found) {
    return res.status(404).json({ ok: false, reason: caseData.reason });
  }

  res.json({
    ok: true,
    caseId,
    telemetry: caseData.telemetry,
    readingCount: caseData.telemetry.length,
  });
});

/**
 * Dashboard: Node health and recent activity
 * GET /dashboard/health
 *
 * Returns:
 * - ledgerBlocks: total block count
 * - transactionsByType: count of each transaction type
 * - recentTransactions: last 5 blocks with timestamp/type/hash
 * - timestamp: current server time
 *
 * No access control (health check is public)
 */
app.get("/dashboard/health", (req, res) => {
  const ledgerData = ledger.readLedger();
  const health = getHealthSummary(ledgerData, ORG_NAME);
  res.json(health);
});

async function replicateToPeers(block) {
  const results = [];
  for (const peerUrl of PEERS) {
    try {
      await axios.post(`${peerUrl}/internal/replicate`, { block }, {
        timeout: 5000,
        headers: { 'X-Internal-Token': INTERNAL_TOKEN }
      });
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
