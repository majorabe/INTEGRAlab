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
 */
function buildNextBlock({ txType, payload, signatures }) {
  const last = getLastBlock();
  const block = {
    index: last ? last.index + 1 : 0,
    timestamp: new Date().toISOString(),
    txType,
    payload,
    signatures,
    prevHash: last ? last.hash : "0".repeat(64),
  };
  block.hash = computeBlockHash(block);
  return block;
}

/**
 * Agrega un bloque ya construido y validado. Antes de escribirlo,
 * revalida que encadene correctamente con el último bloque local
 * (defensa contra bloques recibidos por replicación que no correspondan).
 */
function appendBlock(block) {
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
