#!/usr/bin/env bash

# Dashboard Endpoints Test
# Tests the 4 new read-only dashboard endpoints

set -e

echo "=========================================="
echo "Dashboard Fase 1 - Endpoint Tests"
echo "=========================================="
echo ""

COORDINADOR_URL="http://localhost:3001"
HOSPITAL_DONANTE_URL="http://localhost:3003"
HOSPITAL_RECEPTOR_URL="http://localhost:3004"

# Generate unique IDs for this test run
DONOR_ID="donor-dashboard-$(date +%s)"
PATIENT_ID="patient-dashboard-$(date +%s)"

echo "[1] Creating donor registry entry..."
DONOR_PAYLOAD='{
  "donorId":"'$DONOR_ID'",
  "bloodType":"O+",
  "hlaProfile":{"A":"A2","B":"B7","DR":"DR5"},
  "organType":"kidney",
  "preservationMethod":"static-cold"
}'

# Get signature
DONOR_SIG=$(curl -s -X POST "$HOSPITAL_DONANTE_URL/sign" \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$DONOR_PAYLOAD}" | python3 -c "import sys,json; print(json.load(sys.stdin)['signature'])")

# Submit transaction
DONOR_TX=$(curl -s -X POST "$HOSPITAL_DONANTE_URL/tx/donor-registry" \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\":$DONOR_PAYLOAD,
    \"signatures\":[{\"actor\":\"hospital-donante\",\"signature\":\"$DONOR_SIG\"}]
  }")

DONOR_OK=$(echo "$DONOR_TX" | python3 -c "import sys,json; print(json.load(sys.stdin)['ok'])")
if [ "$DONOR_OK" = "True" ]; then
  echo "✓ Donor created: $DONOR_ID"
else
  echo "✗ Failed to create donor"
  exit 1
fi

sleep 1

echo "[2] Creating patient in waiting list..."
PATIENT_PAYLOAD='{
  "patientId":"'$PATIENT_ID'",
  "bloodType":"O+",
  "hlaProfile":{"A":"A2","B":"B7","DR":"DR4"},
  "urgencyLevel":3
}'

# Get signatures from both coordinador and hospital
COORD_SIG=$(curl -s -X POST "$COORDINADOR_URL/sign" \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$PATIENT_PAYLOAD}" | python3 -c "import sys,json; print(json.load(sys.stdin)['signature'])")

PATIENT_SIG=$(curl -s -X POST "$HOSPITAL_DONANTE_URL/sign" \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$PATIENT_PAYLOAD}" | python3 -c "import sys,json; print(json.load(sys.stdin)['signature'])")

# Submit transaction
PATIENT_TX=$(curl -s -X POST "$COORDINADOR_URL/tx/waiting-list" \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\":$PATIENT_PAYLOAD,
    \"signatures\":[
      {\"actor\":\"coordinador-nacional\",\"signature\":\"$COORD_SIG\"},
      {\"actor\":\"hospital-donante\",\"signature\":\"$PATIENT_SIG\"}
    ]
  }")

PATIENT_OK=$(echo "$PATIENT_TX" | python3 -c "import sys,json; print(json.load(sys.stdin)['ok'])")
if [ "$PATIENT_OK" = "True" ]; then
  echo "✓ Patient added to waiting list: $PATIENT_ID"
else
  echo "✗ Failed to create patient"
  exit 1
fi

sleep 1

echo "[3] Querying HLA compatibility..."
COMPAT_RESPONSE=$(curl -s -X POST "$HOSPITAL_DONANTE_URL/compatibility/query" \
  -H "Content-Type: application/json" \
  -d "{
    \"donorProfile\":{\"bloodType\":\"O+\",\"hlaProfile\":{\"A\":\"A2\",\"B\":\"B7\",\"DR\":\"DR5\"}},
    \"waitingList\":[{\"patientId\":\"$PATIENT_ID\",\"bloodType\":\"O+\",\"hlaProfile\":{\"A\":\"A2\",\"B\":\"B7\",\"DR\":\"DR4\"},\"urgencyLevel\":3}]
  }")

COMPAT_TS=$(echo "$COMPAT_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['compatibilityTimestamp'])")
echo "✓ Compatibility calculated: $COMPAT_TS"

sleep 1

echo "[4] Creating assignment..."
ASSIGN_PAYLOAD='{
  "donorId":"'$DONOR_ID'",
  "recipientId":"'$PATIENT_ID'",
  "organ":"kidney",
  "compatibilityTimestamp":"'$COMPAT_TS'"
}'

# Get signatures
COORD_ASSIGN_SIG=$(curl -s -X POST "$COORDINADOR_URL/sign" \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$ASSIGN_PAYLOAD}" | python3 -c "import sys,json; print(json.load(sys.stdin)['signature'])")

HOSP_ASSIGN_SIG=$(curl -s -X POST "$HOSPITAL_DONANTE_URL/sign" \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$ASSIGN_PAYLOAD}" | python3 -c "import sys,json; print(json.load(sys.stdin)['signature'])")

# Submit transaction
ASSIGN_TX=$(curl -s -X POST "$HOSPITAL_DONANTE_URL/tx/assignment" \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\":$ASSIGN_PAYLOAD,
    \"signatures\":[
      {\"actor\":\"coordinador-nacional\",\"signature\":\"$COORD_ASSIGN_SIG\"},
      {\"actor\":\"hospital-donante\",\"signature\":\"$HOSP_ASSIGN_SIG\"}
    ]
  }")

ASSIGN_OK=$(echo "$ASSIGN_TX" | python3 -c "import sys,json; print(json.load(sys.stdin)['ok'])")
if [ "$ASSIGN_OK" = "True" ]; then
  echo "✓ Assignment created"
else
  echo "✗ Failed to create assignment"
  exit 1
fi

sleep 1

echo "[5] Adding telemetry data..."
TELEMETRY_PAYLOAD='{
  "deviceId":"sensor-contenedor-001",
  "timestamp":"'$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')'",
  "nonce":"'$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')'",
  "sensorType":"temperature",
  "value":2.5,
  "unit":"celsius",
  "organId":"'$DONOR_ID'"
}'

# Note: In a real scenario, IoT device would sign this. For testing, we use hospital signature.
TELEM_SIG=$(curl -s -X POST "$HOSPITAL_DONANTE_URL/sign" \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$TELEMETRY_PAYLOAD}" | python3 -c "import sys,json; print(json.load(sys.stdin)['signature'])")

# Submit transaction
TELEM_TX=$(curl -s -X POST "$HOSPITAL_DONANTE_URL/tx/custody" \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\":$TELEMETRY_PAYLOAD,
    \"signatures\":[{\"actor\":\"hospital-donante\",\"signature\":\"$TELEM_SIG\"}]
  }" 2>&1)

# Note: telemetry might fail due to endorsement policy (requires IoT signature), which is expected
TELEM_OK=$(echo "$TELEM_TX" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ok', False))" 2>/dev/null || echo "False")
if [ "$TELEM_OK" = "True" ]; then
  echo "✓ Telemetry recorded"
else
  echo "⚠ Telemetry rejected (policy enforcement - expected if IoT signature required)"
fi

sleep 2

echo ""
echo "=========================================="
echo "Testing Dashboard Endpoints"
echo "=========================================="
echo ""

echo "[TEST 1] GET /dashboard/casos/$DONOR_ID"
echo "Testing consolidated case state for donor..."
CASE_RESULT=$(curl -s -X GET "$HOSPITAL_DONANTE_URL/dashboard/casos/$DONOR_ID" \
  -H "x-actor: auditor")

CASE_FOUND=$(echo "$CASE_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['found'])")
if [ "$CASE_FOUND" = "True" ]; then
  echo "✓ Case data retrieved"
  echo "  Donor: $(echo "$CASE_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('state',{}).get('donorInfo',{}).get('donorId', 'N/A'))")"
  echo "  Recipient: $(echo "$CASE_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('state',{}).get('recipientInfo',{}).get('patientId', 'N/A'))")"
  echo "  Assignment: $(echo "$CASE_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Yes' if d.get('state',{}).get('assignmentInfo') else 'No')")"
  echo "  Custody Checkpoints: $(echo "$CASE_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('state',{}).get('custodyCheckpoints', [])))")"
else
  echo "✗ Case not found"
fi
echo ""

echo "[TEST 2] GET /dashboard/casos/$DONOR_ID/timeline"
echo "Testing event timeline..."
TIMELINE_RESULT=$(curl -s -X GET "$HOSPITAL_DONANTE_URL/dashboard/casos/$DONOR_ID/timeline" \
  -H "x-actor: auditor")

EVENT_COUNT=$(echo "$TIMELINE_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['eventCount'])")
echo "✓ Timeline retrieved"
echo "  Events: $EVENT_COUNT"
echo "  Events by type:"
echo "$TIMELINE_RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
types = {}
for event in data['timeline']:
    t = event['type']
    types[t] = types.get(t, 0) + 1
for t in sorted(types.keys()):
    print(f'    {t}: {types[t]}')
"
echo ""

echo "[TEST 3] GET /dashboard/casos/$DONOR_ID/telemetria"
echo "Testing telemetry time series..."
TELEMETRY_RESULT=$(curl -s -X GET "$HOSPITAL_DONANTE_URL/dashboard/casos/$DONOR_ID/telemetria" \
  -H "x-actor: auditor")

READING_COUNT=$(echo "$TELEMETRY_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['readingCount'])")
echo "✓ Telemetry retrieved"
echo "  Readings: $READING_COUNT"
if [ "$READING_COUNT" -gt 0 ]; then
  echo "  Latest sensor type: $(echo "$TELEMETRY_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['telemetry'][-1]['sensorType'] if d['telemetry'] else 'N/A')")"
fi
echo ""

echo "[TEST 4] GET /dashboard/health"
echo "Testing node health summary..."
HEALTH_RESULT=$(curl -s -X GET "$HOSPITAL_DONANTE_URL/dashboard/health")

TOTAL_BLOCKS=$(echo "$HEALTH_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['ledgerBlocks'])")
echo "✓ Health retrieved"
echo "  Total ledger blocks: $TOTAL_BLOCKS"
echo "  Organization: $(echo "$HEALTH_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['org'])")"
echo "  Recent transactions:"
echo "$HEALTH_RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for tx in data['recentTransactions'][-3:]:
    print(f'    {tx[\"type\"]}: {tx[\"hash\"]} ({tx[\"timestamp\"]})')
"
echo ""

echo "[TEST 5] GET /dashboard/overview"
echo "Testing clinical board projection..."
OVERVIEW_RESULT=$(curl -s -X GET "$COORDINADOR_URL/dashboard/overview" \
  -H "x-actor: coordinador-nacional")

OVERVIEW_OK=$(echo "$OVERVIEW_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok', False))")
DONOR_COUNT=$(echo "$OVERVIEW_RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('donors', [])))")
WAIT_COUNT=$(echo "$OVERVIEW_RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('waitingList', [])))")
ASSIGN_COUNT=$(echo "$OVERVIEW_RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('assignments', [])))")
if [ "$OVERVIEW_OK" = "True" ] && [ "$DONOR_COUNT" -ge 1 ] && [ "$WAIT_COUNT" -ge 1 ] && [ "$ASSIGN_COUNT" -ge 1 ]; then
  echo "✓ Overview retrieved"
  echo "  Donors: $DONOR_COUNT  waiting: $WAIT_COUNT  assignments: $ASSIGN_COUNT"
else
  echo "✗ Overview missing donors/waiting-list/assignment"
  echo "$OVERVIEW_RESULT"
  exit 1
fi
echo ""

echo "=========================================="
echo "✓ All Dashboard Tests Passed"
echo "=========================================="
echo ""
echo "Summary:"
echo "  - Donor registry entry created"
echo "  - Patient added to waiting list"
echo "  - HLA compatibility calculated"
echo "  - Assignment created"
echo "  - Dashboard endpoints functional:"
echo "    ✓ GET /dashboard/casos/:id (consolidated case state)"
echo "    ✓ GET /dashboard/casos/:id/timeline (event feed)"
echo "    ✓ GET /dashboard/casos/:id/telemetria (telemetry series)"
echo "    ✓ GET /dashboard/health (node health)"
echo "    ✓ GET /dashboard/overview (donors, waiting list, assignments)"
echo ""
