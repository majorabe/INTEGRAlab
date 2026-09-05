/**
 * Cierre de trazabilidad: el órgano llega al hospital receptor.
 *
 * Un bloque `reception` sella el traslado. Requiere un assignment previo
 * del mismo donorId. No se puede recibir dos veces el mismo órgano.
 */

function organKey(payload) {
  if (!payload || typeof payload !== "object") return "";
  const id = payload.donorId || payload.organId;
  return typeof id === "string" ? id.trim() : "";
}

function findAssignment(blocks, donorId) {
  return (blocks || []).find(
    (b) => b.txType === "assignment" && b.payload && b.payload.donorId === donorId
  );
}

function hasReception(blocks, donorId) {
  return (blocks || []).some((b) => {
    if (b.txType !== "reception" || !b.payload) return false;
    return organKey(b.payload) === donorId;
  });
}

function assertReceptionBusinessRules(payload, blocks) {
  const donorId = organKey(payload);
  if (!donorId) {
    return {
      ok: false,
      status: 400,
      reason: "Recepción requiere donorId (u organId) del órgano que llega",
    };
  }

  const assignment = findAssignment(blocks, donorId);
  if (!assignment) {
    return {
      ok: false,
      status: 409,
      reason: `No hay assignment para ${donorId}. No se puede recibir un órgano que no fue asignado.`,
    };
  }

  const expectedRecipient = assignment.payload.recipientId || assignment.payload.patientId;
  if (payload.recipientId && expectedRecipient && payload.recipientId !== expectedRecipient) {
    return {
      ok: false,
      status: 400,
      reason: `recipientId ${payload.recipientId} no coincide con la asignación (${expectedRecipient})`,
    };
  }

  if (hasReception(blocks, donorId)) {
    return {
      ok: false,
      status: 409,
      reason: `El órgano ${donorId} ya fue recibido. El circuito de trazabilidad está cerrado.`,
    };
  }

  return { ok: true };
}

module.exports = { assertReceptionBusinessRules, hasReception, organKey };
