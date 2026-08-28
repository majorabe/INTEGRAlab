/**
 * Ledger append-only con encadenamiento de hashes.
 *
 * Cada nodo mantiene su propia copia del ledger en disco (JSON).
 * Un bloque alterado retroactivamente rompe la cadena de hashes y
 * queda detectado por verifyChainIntegrity().
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = process.env.LEDGER_DATA_DIR || "/data";
const LEDGER_FILE = path.join(DATA_DIR, "ledger.json");

/**
 * SERIALIZACIÓN DE ESCRITURAS AL LEDGER
 *
 * Implementación manual de mutex para evitar race conditions
 * cuando múltiples requests llaman a appendBlock() simultáneamente.
 * Sin este mutex:
 * 1. Dos POST concurrentes ambas llaman readLedger() → ven los mismos N bloques
 * 2. Ambas construyen bloque N+1 sobre el mismo prevHash
 * 3. Ambas llaman writeLedger() casi simultáneamente
 * 4. Una sobrescribe la otra → fork
 *
 * Con mutex: appendBlock() es atomic — solo un request por vez
 * puede hacer read-modify-write del ledger local.
 */
let appendBlockLocked = false;
const appendBlockWaiters = [];

async function acquireAppendBlockLock() {
  while (appendBlockLocked) {
    await new Promise(resolve => appendBlockWaiters.push(resolve));
  }
  appendBlockLocked = true;
}

function releaseAppendBlockLock() {
  appendBlockLocked = false;
  const nextWaiter = appendBlockWaiters.shift();
  if (nextWaiter) nextWaiter();
}

function ensureLedgerFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LEDGER_FILE)) fs.writeFileSync(LEDGER_FILE, JSON.stringify([], null, 2));
}

function readLedger() {
  ensureLedgerFile();
  return JSON.parse(fs.readFileSync(LEDGER_FILE, "utf8"));
}

function writeLedger(blocks) {
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(blocks, null, 2));
}

function getLastBlock() {
  const blocks = readLedger();
  return blocks.length ? blocks[blocks.length - 1] : null;
}

function computeBlockHash(block) {
  const { hash, ...rest } = block;
  return crypto.createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

/**
 * Construye un bloque nuevo encadenado al último bloque local.
 * No lo persiste todavía: eso lo hace appendBlock una vez validado.
 *
 * IMPORTANTE (Fase 3-4 Seguridad): endorsedBy registra qué actores fueron
 * validados por checkEndorsement() en el nodo que recibió la transacción.
 * Esto permite que peers validen que los actores que firmaron sean exactamente
 * los que fueron endosados originalmente, evitando que un nodo malintencionado
 * reemplace las firmas por una combinación distinta que aún cumpla la policy.
 */
function buildNextBlock({ txType, payload, signatures, validOrgs = [] }) {
  const last = getLastBlock();
  const block = {
    index: last ? last.index + 1 : 0,
    timestamp: new Date().toISOString(),
    txType,
    payload,
    signatures,
    endorsedBy: validOrgs.sort(),  // Sorted para comparación determinista en peers
    prevHash: last ? last.hash : "0".repeat(64),
  };
  block.hash = computeBlockHash(block);
  return block;
}

/**
 * Agrega un bloque ya construido y validado. Antes de escribirlo,
 * revalida que encadene correctamente con el último bloque local
 * (defensa contra bloques recibidos por replicación que no correspondan).
 *
 * SERIALIZADO: Este método es async y usa un mutex para garantizar que
 * solo un appendBlock() por vez puede hacer read-modify-write del ledger
 * local. Sin esto, dos POST concurrentes crean un fork.
 */
async function appendBlock(block) {
  // Adquirir lock (espera si otro appendBlock está en ejecución)
  await acquireAppendBlockLock();

  try {
    const blocks = readLedger();
    const last = blocks.length ? blocks[blocks.length - 1] : null;
    const expectedPrevHash = last ? last.hash : "0".repeat(64);

    if (block.prevHash !== expectedPrevHash) {
      return { ok: false, reason: "prevHash no coincide con el último bloque local (posible fork o tampering)" };
    }
    const recomputed = computeBlockHash(block);
    if (recomputed !== block.hash) {
      return { ok: false, reason: "El hash del bloque no coincide con su contenido (posible tampering)" };
    }
    blocks.push(block);
    writeLedger(blocks);
    return { ok: true, block };
  } finally {
    // Siempre liberar lock, incluso si hay error
    releaseAppendBlockLock();
  }
}

/**
 * Recorre todo el ledger local y verifica que la cadena de hashes sea íntegra.
 * Útil para el test de "tampering directo sobre el archivo del ledger".
 */
function verifyChainIntegrity() {
  const blocks = readLedger();
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const recomputed = computeBlockHash(block);
    if (recomputed !== block.hash) {
      return { valid: false, brokenAt: block.index, reason: "Hash del bloque no coincide con su contenido" };
    }
    const expectedPrevHash = i === 0 ? "0".repeat(64) : blocks[i - 1].hash;
    if (block.prevHash !== expectedPrevHash) {
      return { valid: false, brokenAt: block.index, reason: "prevHash no coincide con el bloque anterior" };
    }
  }
  return { valid: true, length: blocks.length };
}

module.exports = {
  readLedger,
  getLastBlock,
  buildNextBlock,
  appendBlock,
  verifyChainIntegrity,
  computeBlockHash,
};
