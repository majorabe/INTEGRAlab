/**
 * Motor de compatibilidad HLA (Human Leukocyte Antigen).
 *
 * HLA es un sistema de antígenos de histocompatibilidad que determina qué tan bien
 * el sistema inmune del receptor aceptará el órgano donado.
 *
 * Cada individuo tiene 6 alelos HLA (2 en cada locus: A, B, DR).
 * Cuantos más alelos coincidan entre donante y receptor, menor es el riesgo de
 * rechazo.
 *
 * Este módulo es SOLO LECTURA: no modifica el ledger, solo calcula compatibilidad
 * basada en grupos sanguíneos y perfiles HLA.
 */

/**
 * Calcula un score de compatibilidad HLA entre donante y receptor (0-100).
 *
 * Fórmula:
 *   - Se comparan 3 loci: A, B, DR
 *   - Cada locus suma 1 punto si hay coincidencia de alelo (match)
 *   - Máximo 3 puntos (1 por locus)
 *   - Score = (totalMatches / 3) * 100
 *
 * Ejemplo:
 *   donorHLA = { A: "A2", B: "B7", DR: "DR4" }
 *   recipientHLA = { A: "A2", B: "B7", DR: "DR4" }
 *   matches = 3 (A coincide, B coincide, DR coincide)
 *   score = (3 / 3) * 100 = 100 (compatibilidad perfecta)
 *
 *   Ejemplo con 1 mismatch:
 *   donorHLA = { A: "A2", B: "B7", DR: "DR5" }
 *   recipientHLA = { A: "A2", B: "B7", DR: "DR4" }
 *   matches = 2 (A coincide, B coincide, DR no coincide)
 *   score = (2 / 3) * 100 = 66.67
 *
 *   (Nota: En realidad, cada gen puede estar duplicado en la realidad biológica,
 *    pero para este scaffold simplificado, tratamos cada locus como un alelo único)
 *
 * @param {Object} donorHLA - Perfil HLA del donante: { A: string, B: string, DR: string }
 * @param {Object} recipientHLA - Perfil HLA del receptor: { A: string, B: string, DR: string }
 * @returns {number} Score de 0 a 100 (100 = compatibilidad perfecta)
 */
function calculateHLAScore(donorHLA, recipientHLA) {
  if (!donorHLA || !recipientHLA) return 0;

  const loci = ["A", "B", "DR"];
  let totalMatches = 0;

  for (const locus of loci) {
    const donorAllele = donorHLA[locus];
    const recipientAllele = recipientHLA[locus];

    // Un match en este locus suma 1 (en realidad cada locus tiene 2 alelos,
    // pero para simplificar tratamos cada locus como un punto de comparación)
    if (donorAllele && recipientAllele && donorAllele === recipientAllele) {
      totalMatches += 1;
    }
  }

  // Score: (matches / 3 loci) * 100
  return (totalMatches / 3) * 100;
}

/**
 * Busca candidatos compatibles en la lista de espera para un donante dado.
 *
 * @param {Object} donorProfile - Perfil del donante:
 *   {
 *     bloodType: string (ej. "O+"),
 *     hlaProfile: { A: string, B: string, DR: string }
 *   }
 *
 * @param {Array} waitingList - Array de candidatos:
 *   [
 *     {
 *       patientId: string,
 *       bloodType: string,
 *       hlaProfile: { A: string, B: string, DR: string },
 *       urgencyLevel: number (1-5, donde 5 es más urgente)
 *     },
 *     ...
 *   ]
 *
 * @returns {Array} Candidatos ordenados por:
 *   1. Compatibilidad de grupo sanguíneo (filtro)
 *   2. Score HLA descendente (mejor compatibilidad primero)
 *   3. Urgency level descendente (criterio de desempate)
 */
function queryCompatible(donorProfile, waitingList) {
  if (!donorProfile || !Array.isArray(waitingList)) return [];

  const { bloodType: donorBlood, hlaProfile: donorHLA } = donorProfile;
  if (!donorBlood || !donorHLA) return [];

  // Filtro de compatibilidad de grupo sanguíneo (simplificado):
  // - Donante O+ es universal (compatible con cualquiera)
  // - Donante de tipo X es compatible con X y con AB (receptor universal)
  const isCompatibleBlood = (donorType, recipientType) => {
    if (donorType === "O+") return true; // Universal donor
    if (recipientType === "AB+") return true; // Universal recipient
    return donorType === recipientType;
  };

  // Filtrar por compatibilidad de grupo sanguíneo
  const compatible = waitingList.filter((candidate) =>
    isCompatibleBlood(donorBlood, candidate.bloodType)
  );

  // Calcular HLA score para cada candidato compatible
  const scored = compatible.map((candidate) => ({
    ...candidate,
    hlaScore: calculateHLAScore(donorHLA, candidate.hlaProfile),
  }));

  // Ordenar por HLA score descendente, luego por urgencyLevel descendente
  scored.sort((a, b) => {
    if (b.hlaScore !== a.hlaScore) {
      return b.hlaScore - a.hlaScore; // Mayor score primero
    }
    return b.urgencyLevel - a.urgencyLevel; // Mayor urgencia primero en caso de empate
  });

  return scored;
}

module.exports = { calculateHLAScore, queryCompatible };
