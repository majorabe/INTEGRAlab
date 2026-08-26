/**
 * Políticas de endorsement por tipo de transacción.
 * Ver Paso 2, sección 4.1 "Políticas de endorsement".
 *
 * Cada política recibe la lista de firmas ya verificadas criptográficamente
 * (ver crypto-utils.verifySignature) y decide si, en conjunto, cumplen la
 * regla de negocio para ese tipo de transacción.
 */

const POLICIES = {
  // DonorRegistry: solo escritura con firma del hospital emisor.
  "donor-registry": (validOrgs, payload) => {
    const ok = validOrgs.includes("hospital-donante");
    return { ok, reason: ok ? null : "DonorRegistry requiere firma de hospital-donante" };
  },

  // WaitingListManager: requiere endorsement del coordinador nacional +
  // al menos 1 organización más (hospital o coordinador provincial).
  // Ningún actor individual puede modificar la lista solo.
  "waiting-list": (validOrgs, payload) => {
    const hasNacional = validOrgs.includes("coordinador-nacional");
    const distinctOrgs = new Set(validOrgs);
    const ok = hasNacional && distinctOrgs.size >= 2;
    return {
      ok,
      reason: ok
        ? null
        : "WaitingListManager requiere firma de coordinador-nacional + al menos 1 organización adicional",
    };
  },

  // AssignmentContract: firma del coordinador nacional + endorsement del
  // hospital donante, más validación de compatibilityTimestamp para prevenir
  // replay de cálculos de compatibilidad antiguos.
  assignment: (validOrgs, payload) => {
    // Verificar firmas requeridas
    const hasRequiredSignatures =
      validOrgs.includes("coordinador-nacional") && validOrgs.includes("hospital-donante");
    if (!hasRequiredSignatures) {
      return {
        ok: false,
        reason: "AssignmentContract requiere firma de coordinador-nacional + endorsement de hospital-donante",
      };
    }

    // Validar compatibilityTimestamp (prevención de replay)
    if (!payload || typeof payload !== "object") {
      return { ok: false, reason: "Payload inválido para validación de timestamp" };
    }

    const compatibilityTimestamp = payload.compatibilityTimestamp;
    if (!compatibilityTimestamp) {
      return {
        ok: false,
        reason: "AssignmentContract requiere compatibilityTimestamp en el payload (resultado de /compatibility/query)",
      };
    }

    // Validar que el timestamp no sea más antiguo que 30 minutos
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;
    const now = new Date().getTime();
    let tsTime;
    try {
      tsTime = new Date(compatibilityTimestamp).getTime();
    } catch (err) {
      return { ok: false, reason: `compatibilityTimestamp inválido: ${compatibilityTimestamp}` };
    }

    const ageDiff = now - tsTime;
    if (ageDiff < 0) {
      return { ok: false, reason: "compatibilityTimestamp es del futuro (reloj del cliente desincronizado?)" };
    }
    if (ageDiff > THIRTY_MINUTES_MS) {
      return {
        ok: false,
        reason: `compatibilityTimestamp expirado (antigüedad: ${Math.round(ageDiff / 1000 / 60)} min, máximo: 30 min)`,
      };
    }

    return { ok: true, reason: null };
  },

  // CustodyChain: escritura por dispositivo IoT autenticado, con endorsement
  // del hospital que emite la custodia.
  custody: (validOrgs, payload) => {
    const hasDevice = validOrgs.some((o) => o.startsWith("iot:"));
    const hasHospital = validOrgs.includes("hospital-donante") || validOrgs.includes("hospital-receptor");
    const ok = hasDevice && hasHospital;
    return {
      ok,
      reason: ok ? null : "CustodyChain requiere firma de un dispositivo IoT + endorsement de un hospital",
    };
  },
};

/**
 * Evalúa la política de endorsement para un tipo de transacción dado.
 * `validOrgs` es el array de identificadores de actor cuyas firmas ya
 * fueron verificadas criptográficamente contra un certificado válido.
 * `payload` se pasa para que ciertas políticas puedan validar contenido
 * (ej. AssignmentContract valida compatibilityTimestamp).
 */
function checkEndorsement(txType, validOrgs, payload) {
  const policy = POLICIES[txType];
  if (!policy) return { ok: false, reason: `Tipo de transacción desconocido: "${txType}"` };
  return policy(validOrgs, payload);
}

module.exports = { checkEndorsement, POLICIES };
