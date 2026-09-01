/**
 * Reglas de negocio de custodia (telemetría del contenedor).
 *
 * Un bloque custody no es "ruido de red": es trazabilidad de un órgano
 * ya asignado. Sin organId no hay vínculo al caso clínico. Sin assignment
 * previo en el ledger, el traslado todavía no empezó.
 */

function assertCustodyBusinessRules(payload, blocks) {
  const organId = payload && typeof payload.organId === "string" ? payload.organId.trim() : "";
  if (!organId) {
    return {
      ok: false,
      status: 400,
      reason: "Custody requiere organId igual al donorId del órgano en tránsito",
    };
  }

  const assigned = (blocks || []).some(
    (b) => b.txType === "assignment" && b.payload && b.payload.donorId === organId
  );
  if (!assigned) {
    return {
      ok: false,
      status: 409,
      reason:
        `No hay assignment para organId=${organId}. ` +
        "La telemetría solo se graba después de asignar el órgano (inicio de trazabilidad).",
    };
  }

  return { ok: true };
}

module.exports = { assertCustodyBusinessRules };
