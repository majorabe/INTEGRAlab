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
  "donor-registry": (validOrgs) => {
    const ok = validOrgs.includes("hospital-donante");
    return { ok, reason: ok ? null : "DonorRegistry requiere firma de hospital-donante" };
  },

  // WaitingListManager: requiere endorsement del coordinador nacional +
  // al menos 1 organización más (hospital o coordinador provincial).
  // Ningún actor individual puede modificar la lista solo.
  "waiting-list": (validOrgs) => {
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
  // hospital donante.
  assignment: (validOrgs) => {
    const ok = validOrgs.includes("coordinador-nacional") && validOrgs.includes("hospital-donante");
    return {
      ok,
      reason: ok ? null : "AssignmentContract requiere firma de coordinador-nacional + endorsement de hospital-donante",
    };
  },

  // CustodyChain: escritura por dispositivo IoT autenticado, con endorsement
  // del hospital que emite la custodia.
  custody: (validOrgs) => {
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
 */
function checkEndorsement(txType, validOrgs) {
  const policy = POLICIES[txType];
  if (!policy) return { ok: false, reason: `Tipo de transacción desconocido: "${txType}"` };
  return policy(validOrgs);
}

module.exports = { checkEndorsement, POLICIES };
