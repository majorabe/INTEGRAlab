# Dashboard Fase 1 - Endpoints Summary

## Implementation Status: ✅ COMPLETE

All 4 read-only dashboard endpoints have been successfully implemented, tested, and documented.

### Architecture

**Key Design Decision:** Read-only projection layer on top of immutable ledger (single source of truth)

- Ledger: Append-only, hash-chained, cryptographically verified
- Dashboard Layer: Transforms ledger data into consumable formats without replication or modification
- No changes to: `server.js` core logic, endorsement policies, transaction validation, or existing tests

### Endpoints Implemented

#### 1. GET /dashboard/casos/:id
**Purpose:** Consolidated case state

**Response Fields:**
- `caseId`: The queried ID (donor or recipient)
- `state`:
  - `donorInfo`: Donor registry data (if found)
  - `recipientInfo`: Patient waiting list data (if found)
  - `assignmentInfo`: Organ assignment details (if found)
  - `custodyCheckpoints`: Array of telemetry readings during transport
  - `transactionCount`: Total transactions affecting this case
  - `lastUpdated`: Timestamp of most recent update
- `timeline`: Event feed (see endpoint #2)
- `telemetry`: Time series (see endpoint #3)
- `summary`: Case closure status and update time

**Access Control:** `x-actor` header must be: self, auditor, coordinador-nacional, or coordinador-provincial

**Example Query:**
```bash
curl -X GET "http://localhost:3003/dashboard/casos/donor-001" \
  -H "x-actor: auditor"
```

#### 2. GET /dashboard/casos/:id/timeline
**Purpose:** Ordered event feed for a case

**Response Fields:**
- `caseId`: Queried ID
- `timeline`: Array of events with:
  - `timestamp`: When event occurred (ISO 8601)
  - `type`: Transaction type (donor-registry, waiting-list, assignment, custody)
  - `action`: Human-readable description (e.g., "Organ assigned: donor-001 → patient-001")
  - `actors`: List of co-signing organizations
  - `actorCount`: Number of actors
  - `hash`: Shortened block hash (first 16 chars) for display
  - `fullHash`: Complete SHA-256 hash for verification
  - `payloadSummary`: Key fields from transaction
  - `signatureCount`: Number of cryptographic signatures
- `eventCount`: Total events in timeline

**Access Control:** Same as endpoint #1

**Example Query:**
```bash
curl -X GET "http://localhost:3003/dashboard/casos/donor-001/timeline" \
  -H "x-actor: auditor"
```

#### 3. GET /dashboard/casos/:id/telemetria
**Purpose:** Time series of custody chain telemetry

**Response Fields:**
- `caseId`: Queried ID
- `telemetry`: Array of sensor readings with:
  - `timestamp`: When reading was recorded
  - `deviceId`: IoT sensor identifier
  - `sensorType`: Sensor type (e.g., "temperature", "humidity")
  - `value`: Numeric reading
  - `unit`: Unit of measurement (e.g., "celsius")
- `readingCount`: Total number of readings

**Use Cases:**
- Monitor organ preservation conditions during transport
- Track cold chain compliance (temperature maintained ≤ 2-5°C)
- Detect any condition violations

**Access Control:** Same as endpoint #1

**Example Query:**
```bash
curl -X GET "http://localhost:3003/dashboard/casos/donor-001/telemetria" \
  -H "x-actor: auditor"
```

#### 4. GET /dashboard/health
**Purpose:** Node health summary and recent activity

**Response Fields:**
- `org`: Organization name (hospital-donante, coordinador-nacional, etc.)
- `status`: Node status ("ok")
- `ledgerBlocks`: Total number of blocks in local ledger
- `transactionsByType`: Count of each transaction type:
  - `donor-registry`: Donor registrations
  - `waiting-list`: Patients added to waiting list
  - `assignment`: Organ assignments
  - `custody`: Telemetry readings
- `recentTransactions`: Last 5 blocks with timestamp, type, and shortened hash
- `timestamp`: Server timestamp of health check response

**Use Cases:**
- Cluster monitoring (are all nodes synchronized?)
- Performance baseline (how many transactions processed?)
- Quick sanity check (node is up and responding)

**Access Control:** Public (no authentication required)

**Example Query:**
```bash
curl -X GET "http://localhost:3003/dashboard/health"
```

### File Changes

**New Files:**
- `nodes/lib/dashboard-projection.js` (280 lines) — Transformation engine
- `tests/dashboard/test-dashboard-endpoints.sh` — Integration test script
- `tests/dashboard/DASHBOARD_ENDPOINTS_SUMMARY.md` — This documentation

**Modified Files:**
- `nodes/server.js` (lines 24, 233–359) — Added import and 4 new GET endpoints
- `docs/DECISIONES_DE_ALCANCE.md` — Added section #6 documenting architecture rationale

**NOT Modified (Hard Rule Compliance):**
- No changes to `/tx/:type` handler logic
- No changes to endorsement.js policies
- No changes to existing test suite
- No new persistent database or cache layer

### Testing Results

All endpoints tested and verified working with:
- ✅ Donor registry lookups
- ✅ Assignment queries with multi-actor signatures
- ✅ Timeline reconstruction from block history
- ✅ Telemetry data extraction
- ✅ Access control validation (403 for unauthorized actors)
- ✅ 404 responses for non-existent cases
- ✅ Concurrent requests from multiple nodes

### Implementation Details

**Query Engine (`dashboard-projection.js` functions):**

1. `extractCaseTransactions(ledger, caseId)` — Filters ledger blocks by donorId or patientId
2. `buildCaseState(transactions)` — Reconstructs case state (donor, recipient, assignment, telemetry)
3. `buildTimeline(transactions)` — Transforms transactions to event feed with human-readable descriptions
4. `extractTelemetrySeries(transactions)` — Extracts and sorts custody readings by timestamp
5. `queryCase(ledger, caseId)` — Main entry point combining all transformations
6. `getHealthSummary(ledger, orgName)` — Computes node statistics

**Performance Characteristics:**
- Time Complexity: O(n) where n = ledger size (single pass over blocks per query)
- Space Complexity: O(m) where m = transactions affecting the case (usually small)
- No indexing overhead (pure transformation at query time)
- Suitable for ledgers up to several thousand blocks

### Architecture Rationale

This projection layer exemplifies a key architectural principle: **separation of concerns**.

- **Ledger (Write):** Immutable, cryptographically verified, subject to endorsement policy
- **Dashboard (Read):** Consumable format, no bearing on security, can change freely

In production (Hyperledger Fabric):
- Ledger = Blockchain committed state
- Dashboard = External indexer (ElasticSearch, event stream, query cache)
- Never confuse the two; ledger is always source of truth

### Phase 2 & Beyond

This Fase 1 dashboard backend prepares for:
- **Fase 2:** React/Next.js frontend consuming these endpoints
- **Fase 4:** Simulation & decision support (which transplants to prioritize)
- **Production:** Fabric deployment with same architectural principles

The hard rule (no modifications to core logic) ensures that Fase 1 is production-ready from day one.

---

**Tested on:** 2026-08-27
**Status:** All endpoints operational ✅
**Compliance:** Hard rule verified — zero changes to server.js security logic, endorsement, or tests ✅
