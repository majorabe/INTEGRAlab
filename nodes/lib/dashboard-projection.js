const { calculateHLAScore, queryCompatible } = require("./hla-matching");

const DEMO_DONOR_ID = "demo-donor-001";
const DEMO_PATIENT_ID = "demo-patient-001";
const DEMO_SCRIPT = "bash scripts/setup-demo-pitch-data.sh";

/**
 * Dashboard Projection Layer
 *
 * Transforms ledger data into dashboard-consumable formats without modifying
 * the authoritative ledger source. This is a read-only projection layer that:
 * 1. Reconstructs case state from transaction history
 * 2. Builds event timelines with actor/timestamp/hash
 * 3. Extracts telemetry time series from custody transactions
 * 4. Provides read-only access control via x-actor header
 *
 * Architecture decision: Ledger remains single source of truth.
 * This layer is purely transformative.
 */

/**
 * Extract all transactions related to a specific case
 * (by donorId or by any patientId involved in assignments)
 *
 * Matching rules:
 * - donor-registry: payload.donorId === caseId
 * - waiting-list: payload.patientId === caseId
 * - assignment: payload.donorId === caseId OR payload.recipientId === caseId
 * - custody (telemetria): payload.organId === caseId (vinculates telemetry to donor via organId)
 */
function extractCaseTransactions(ledger, caseId) {
  const transactions = [];

  for (const block of ledger) {
    const { txType, payload, hash, signatures, timestamp } = block;

    // Match by donorId (donor-registry, assignment transactions)
    if (payload.donorId === caseId) {
      transactions.push({ block, txType, payload, hash, signatures, timestamp });
      continue;
    }

    // Match by patientId/recipientId (waiting-list, assignment transactions)
    if (payload.patientId === caseId || payload.recipientId === caseId) {
      transactions.push({ block, txType, payload, hash, signatures, timestamp });
      continue;
    }

    // Match by organId (custody/telemetry transactions linked to donor)
    // Custody payloads use organId to reference which donor the organ belongs to
    if (payload.organId === caseId) {
      transactions.push({ block, txType, payload, hash, signatures, timestamp });
      continue;
    }
  }

  return transactions;
}

/**
 * Build consolidated case state from transaction history
 * Returns: { donorInfo, recipientInfo, assignmentInfo, custodyCheckpoints }
 */
function buildCaseState(transactions) {
  const state = {
    donorInfo: null,
    recipientInfo: null,
    assignmentInfo: null,
    receptionInfo: null,
    custodyCheckpoints: [],
    transactionCount: transactions.length,
    lastUpdated: null,
  };

  for (const { txType, payload, timestamp } of transactions) {
    switch (txType) {
      case 'donor-registry':
        state.donorInfo = {
          donorId: payload.donorId,
          bloodType: payload.bloodType,
          hlaProfile: payload.hlaProfile,
          organType: payload.organType,
          preservationMethod: payload.preservationMethod,
          registeredAt: timestamp,
        };
        state.lastUpdated = timestamp;
        break;

      case 'waiting-list':
        state.recipientInfo = {
          patientId: payload.patientId,
          bloodType: payload.bloodType,
          hlaProfile: payload.hlaProfile,
          urgencyLevel: payload.urgencyLevel,
          addedToWaitingListAt: timestamp,
        };
        state.lastUpdated = timestamp;
        break;

      case 'assignment':
        state.assignmentInfo = {
          donorId: payload.donorId,
          recipientId: payload.recipientId || payload.patientId,
          organ: payload.organ || payload.organType,
          hlaScore: payload.hlaScore,
          assignedAt: timestamp,
          compatibilityTimestamp: payload.compatibilityTimestamp,
        };
        state.lastUpdated = timestamp;
        break;

      case 'custody':
        state.custodyCheckpoints.push({
          timestamp,
          sensorType: payload.sensorType || 'temperature',
          value: payload.value ?? payload.temperaturaC,
          unit: payload.unit || 'celsius',
          deviceId: payload.deviceId,
        });
        state.lastUpdated = timestamp;
        break;

      case 'reception':
        state.receptionInfo = {
          donorId: payload.donorId || payload.organId,
          recipientId: payload.recipientId || payload.patientId || null,
          hospital: payload.hospital || 'hospital-receptor',
          receivedAt: timestamp,
        };
        state.lastUpdated = timestamp;
        break;
    }
  }

  // Sort custody checkpoints by timestamp
  state.custodyCheckpoints.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return state;
}

/**
 * Build event timeline from transactions
 * Each event includes: type, timestamp, actor(s), action, hash, payload summary
 */
function buildTimeline(transactions) {
  const events = [];

  for (const { txType, payload, hash, signatures, timestamp } of transactions) {
    const actors = signatures.map(s => s.actor);

    let action = '';
    let payloadSummary = {};

    switch (txType) {
      case 'donor-registry':
        action = `Donor registered: ${payload.donorId}`;
        payloadSummary = {
          donorId: payload.donorId,
          bloodType: payload.bloodType,
          organType: payload.organType,
        };
        break;

      case 'waiting-list':
        action = `Patient added to waiting list: ${payload.patientId}`;
        payloadSummary = {
          patientId: payload.patientId,
          bloodType: payload.bloodType,
          urgencyLevel: payload.urgencyLevel,
        };
        break;

      case 'assignment':
        action = `Organ assigned: ${payload.donorId} → ${payload.recipientId}`;
        payloadSummary = {
          donorId: payload.donorId,
          recipientId: payload.recipientId,
          organ: payload.organ,
          hlaScore: payload.hlaScore,
        };
        break;

      case 'custody':
        action =
          payload.temperaturaC != null
            ? `Lectura de temperatura: ${payload.temperaturaC} °C`
            : `Telemetry recorded: ${payload.sensorType}=${payload.value}${payload.unit}`;
        payloadSummary = {
          deviceId: payload.deviceId,
          temperaturaC: payload.temperaturaC,
        };
        break;

      case 'reception':
        action = `Órgano recibido en hospital receptor: ${payload.donorId || payload.organId}`;
        payloadSummary = {
          donorId: payload.donorId || payload.organId,
          recipientId: payload.recipientId,
          hospital: payload.hospital || 'hospital-receptor',
        };
        break;
    }

    events.push({
      timestamp,
      type: txType,
      action,
      actors,
      actorCount: actors.length,
      hash: hash.substring(0, 16) + '...', // shortened hash for readability
      fullHash: hash,
      payloadSummary,
      signatureCount: signatures.length,
    });
  }

  // Sort by timestamp ascending (oldest first)
  events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return events;
}

/**
 * Extract telemetry time series (custody readings)
 *
 * Parses telemetry payloads using the REAL IoT simulator schema:
 * - temperaturaC: temperature in Celsius (float)
 * - humedadPct: humidity percentage (float)
 * - gps: GPS coordinates (object with lat, lon)
 * - fueraDeRango: boolean alert flag
 * - organo: organ type (string)
 * - secuencia: sequence number (int)
 *
 * See iot-simulator/simulate.js for payload generation.
 */
function extractTelemetrySeries(transactions) {
  const series = [];

  for (const { payload, timestamp } of transactions) {
    // Check if this is a telemetry payload (has temperaturaC field from real IoT schema)
    if (payload.temperaturaC !== undefined) {
      series.push({
        timestamp,
        deviceId: payload.deviceId,
        organo: payload.organo,
        secuencia: payload.secuencia,
        temperaturaC: payload.temperaturaC,
        humedadPct: payload.humedadPct,
        gps: payload.gps,
        fueraDeRango: payload.fueraDeRango,
      });
    }
  }

  // Sort chronologically
  series.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return series;
}

/**
 * Si el caso se consultó por donorId, también trae el waiting-list del receptor
 * (y viceversa) para que la ficha muestre sangre/HLA de ambos.
 */
function expandRelatedTransactions(ledger, caseId) {
  const seed = extractCaseTransactions(ledger, caseId);
  const ids = new Set([caseId]);
  for (const t of seed) {
    if (t.payload.donorId) ids.add(t.payload.donorId);
    if (t.payload.patientId) ids.add(t.payload.patientId);
    if (t.payload.recipientId) ids.add(t.payload.recipientId);
    if (t.payload.organId) ids.add(t.payload.organId);
  }
  const seen = new Set();
  const expanded = [];
  for (const id of ids) {
    for (const t of extractCaseTransactions(ledger, id)) {
      const key = t.hash || `${t.timestamp}:${t.txType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      expanded.push(t);
    }
  }
  return expanded;
}

/**
 * Query case by ID (donorId or patientId/recipientId)
 */
function queryCase(ledger, caseId) {
  const transactions = expandRelatedTransactions(ledger, caseId);

  if (transactions.length === 0) {
    return {
      found: false,
      reason: `No transactions found for case ID: ${caseId}`,
    };
  }

  const caseState = buildCaseState(transactions);
  const timeline = buildTimeline(transactions);
  const telemetry = extractTelemetrySeries(transactions);

  return {
    found: true,
    caseId,
    state: caseState,
    timeline,
    telemetry,
    summary: {
      transactionCount: transactions.length,
      lastUpdated: caseState.lastUpdated,
      isClosed: Boolean(caseState.receptionInfo),
    },
  };
}

/**
 * Get node health summary including recent transactions
 */
function getHealthSummary(ledger, orgName) {
  const blocks = ledger.length;
  const recentBlocks = ledger.slice(Math.max(0, ledger.length - 5));

  const txCountByType = {};
  for (const block of ledger) {
    const type = block.txType || 'unknown';
    txCountByType[type] = (txCountByType[type] || 0) + 1;
  }

  return {
    org: orgName,
    status: 'ok',
    ledgerBlocks: blocks,
    transactionsByType: txCountByType,
    recentTransactions: recentBlocks.map(b => ({
      timestamp: b.timestamp,
      type: b.txType,
      hash: b.hash.substring(0, 16) + '...',
    })),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Tablero clínico: todos los donantes, la lista de espera, asignaciones
 * (con score HLA derivado) y lecturas custody. Solo lectura del ledger.
 */
function buildOverview(ledger) {
  const donorsById = new Map();
  const patientsById = new Map();
  const assignments = [];
  const receptionsByOrgan = new Map();
  const custodyByOrgan = new Map();
  const txCounts = {};

  for (const block of ledger) {
    const { txType, payload = {}, timestamp, hash } = block;
    txCounts[txType] = (txCounts[txType] || 0) + 1;

    if (txType === "donor-registry" && payload.donorId) {
      donorsById.set(payload.donorId, {
        donorId: payload.donorId,
        bloodType: payload.bloodType || null,
        hlaProfile: payload.hlaProfile || null,
        organType: payload.organType || null,
        preservationMethod: payload.preservationMethod || null,
        registeredAt: timestamp,
      });
    }

    if (txType === "waiting-list" && payload.patientId) {
      patientsById.set(payload.patientId, {
        patientId: payload.patientId,
        bloodType: payload.bloodType || null,
        hlaProfile: payload.hlaProfile || null,
        urgencyLevel: payload.urgencyLevel ?? null,
        addedToWaitingListAt: timestamp,
      });
    }

    if (txType === "assignment") {
      assignments.push({
        donorId: payload.donorId,
        recipientId: payload.recipientId || payload.patientId,
        organ: payload.organ || payload.organType || null,
        assignedAt: timestamp,
        compatibilityTimestamp: payload.compatibilityTimestamp || null,
        hlaScore: payload.hlaScore,
        hash,
      });
    }

    if (txType === "reception") {
      const organId = payload.donorId || payload.organId;
      if (organId) {
        receptionsByOrgan.set(organId, {
          donorId: organId,
          recipientId: payload.recipientId || payload.patientId || null,
          hospital: payload.hospital || "hospital-receptor",
          receivedAt: timestamp,
        });
      }
    }

    if (txType === "custody" && payload.organId) {
      const prev = custodyByOrgan.get(payload.organId) || {
        organId: payload.organId,
        readings: 0,
        alertCount: 0,
        samples: [],
      };
      prev.readings += 1;
      if (payload.fueraDeRango) prev.alertCount += 1;
      prev.deviceId = payload.deviceId || prev.deviceId;
      prev.deviceActor = payload.deviceId ? `iot:${payload.deviceId}` : prev.deviceActor;
      prev.lastTimestamp = timestamp;
      prev.lastTempC = payload.temperaturaC ?? payload.value ?? prev.lastTempC;
      prev.organo = payload.organo || prev.organo;
      prev.samples = prev.samples || [];
      prev.samples.push({
        secuencia: payload.secuencia ?? prev.samples.length + 1,
        timestamp,
        temperaturaC: payload.temperaturaC ?? payload.value ?? null,
        humedadPct: payload.humedadPct ?? null,
        fueraDeRango: Boolean(payload.fueraDeRango),
        deviceId: payload.deviceId || prev.deviceId || null,
      });
      custodyByOrgan.set(payload.organId, prev);
    }
  }

  const assignedPatientIds = new Set(assignments.map((a) => a.recipientId).filter(Boolean));
  const assignedDonorIds = new Set(assignments.map((a) => a.donorId).filter(Boolean));
  const receivedPatientIds = new Set(
    [...receptionsByOrgan.values()].map((r) => r.recipientId).filter(Boolean)
  );
  const receivedDonorIds = new Set(receptionsByOrgan.keys());

  const donors = [...donorsById.values()].map((d) => ({
    ...d,
    assigned: assignedDonorIds.has(d.donorId),
    received: receivedDonorIds.has(d.donorId),
  }));

  const assignedByPatient = new Map(assignments.map((a) => [a.recipientId, a.donorId]));

  const waitingList = [...patientsById.values()]
    .map((p) => ({
      ...p,
      assignedDonorId: assignedByPatient.get(p.patientId) || null,
      status: receivedPatientIds.has(p.patientId)
        ? "recibido"
        : assignedPatientIds.has(p.patientId)
          ? "asignado"
          : "en-espera",
    }))
    .sort((a, b) => (b.urgencyLevel || 0) - (a.urgencyLevel || 0));

  const assignmentViews = assignments.map((a) => {
    const donor = donorsById.get(a.donorId);
    const patient = patientsById.get(a.recipientId);
    const hlaScore =
      typeof a.hlaScore === "number"
        ? a.hlaScore
        : donor && patient
          ? calculateHLAScore(donor.hlaProfile, patient.hlaProfile)
          : null;
    const loci = ["A", "B", "DR"].map((locus) => {
      const donorAllele = donor?.hlaProfile?.[locus] ?? null;
      const recipientAllele = patient?.hlaProfile?.[locus] ?? null;
      return {
        locus,
        donor: donorAllele,
        recipient: recipientAllele,
        match: Boolean(donorAllele && donorAllele === recipientAllele),
      };
    });
    return {
      ...a,
      hlaScore,
      organ: a.organ || donor?.organType || null,
      donorBloodType: donor?.bloodType || null,
      recipientBloodType: patient?.bloodType || null,
      hlaLoci: loci,
      hlaMatches: loci.filter((l) => l.match).length,
      custody: custodyByOrgan.get(a.donorId) || null,
      received: receivedDonorIds.has(a.donorId),
      receivedAt: receptionsByOrgan.get(a.donorId)?.receivedAt || null,
    };
  });

  const rankedDonor =
    donors.find((d) => d.assigned && d.bloodType && d.hlaProfile) ||
    donors.find((d) => d.bloodType && d.hlaProfile);
  const matchRanking =
    rankedDonor && waitingList.length
      ? queryCompatible(
          { bloodType: rankedDonor.bloodType, hlaProfile: rankedDonor.hlaProfile },
          waitingList.map((p) => ({
            patientId: p.patientId,
            bloodType: p.bloodType,
            hlaProfile: p.hlaProfile,
            urgencyLevel: p.urgencyLevel,
          }))
        ).map((row) => ({
          patientId: row.patientId,
          bloodType: row.bloodType,
          hlaProfile: row.hlaProfile,
          urgencyLevel: row.urgencyLevel,
          hlaScore: row.hlaScore,
          selected: Boolean(assignedPatientIds.has(row.patientId)),
        }))
      : [];

  const fromDemoScript = donorsById.has(DEMO_DONOR_ID) && patientsById.has(DEMO_PATIENT_ID);

  return {
    donors,
    waitingList,
    assignments: assignmentViews,
    custody: [...custodyByOrgan.values()],
    matchRanking,
    counts: {
      donors: donors.length,
      waiting: waitingList.length,
      waitingUnassigned: waitingList.filter((p) => p.status === "en-espera").length,
      assignments: assignmentViews.length,
      custodyReadings: txCounts.custody || 0,
      ledgerBlocks: ledger.length,
    },
    demoPitch: {
      recognized: fromDemoScript,
      donorId: DEMO_DONOR_ID,
      patientId: DEMO_PATIENT_ID,
      script: DEMO_SCRIPT,
    },
  };
}

module.exports = {
  extractCaseTransactions,
  buildCaseState,
  buildTimeline,
  extractTelemetrySeries,
  queryCase,
  getHealthSummary,
  buildOverview,
  DEMO_DONOR_ID,
  DEMO_PATIENT_ID,
};
