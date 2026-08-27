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
          recipientId: payload.recipientId,
          organ: payload.organ,
          hlaScore: payload.hlaScore,
          assignedAt: timestamp,
          compatibilityTimestamp: payload.compatibilityTimestamp,
        };
        state.lastUpdated = timestamp;
        break;

      case 'custody':
        state.custodyCheckpoints.push({
          timestamp,
          sensorType: payload.sensorType,
          value: payload.value,
          unit: payload.unit,
          deviceId: payload.deviceId,
        });
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
        action = `Telemetry recorded: ${payload.sensorType}=${payload.value}${payload.unit}`;
        payloadSummary = {
          deviceId: payload.deviceId,
          sensorType: payload.sensorType,
          value: payload.value,
          unit: payload.unit,
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
 * Query case by ID (donorId or patientId/recipientId)
 */
function queryCase(ledger, caseId) {
  const transactions = extractCaseTransactions(ledger, caseId);

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
      isClosed: !!caseState.assignmentInfo && caseState.custodyCheckpoints.length > 0,
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

module.exports = {
  extractCaseTransactions,
  buildCaseState,
  buildTimeline,
  extractTelemetrySeries,
  queryCase,
  getHealthSummary,
};
