#!/usr/bin/env bash
# Setup Demo Pitch Data para INTEGRAlab
#
# Escribe los HECHOS CLÍNICOS en el ledger (cada uno = 1 bloque replicado):
#   1. donor-registry      → donante demo-donor-001
#   2. waiting-list        → 3 pacientes (demo-patient-001 asignado; 002 y 003 quedan en espera)
#   3. assignment          → vínculo donante↔paciente (inicio de trazabilidad)
#   4. custody             → lecturas IoT del traslado (tope corto)
#   5. reception           → hospital receptor cierra el circuito
# Después detiene el IoT: el órgano ya llegó.
#
# Uso (raíz del repo, nodos ya arriba, IoT NO tiene que estar corriendo):
#   bash scripts/setup-demo-pitch-data.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

COORD_URL="http://localhost:3001"
DONANTE_URL="http://localhost:3003"
RECEPTOR_URL="http://localhost:3004"

DONOR_ID="demo-donor-001"
PATIENT_ID="demo-patient-001"
PATIENT_B_ID="demo-patient-002"
PATIENT_C_ID="demo-patient-003"

require_ok() {
  local label="$1"
  local json="$2"
  local ok
  ok="$(echo "$json" | jq -r '.ok // empty')"
  if [[ "$ok" != "true" ]]; then
    echo -e "${RED}✗ ${label}${NC}"
    echo "$json" | jq . 2>/dev/null || echo "$json"
    exit 1
  fi
}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}SETUP: caso clínico demo${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

echo -e "${YELLOW}[1] Verificando nodos...${NC}"
if ! curl -s "$COORD_URL/health" > /dev/null 2>&1; then
  echo -e "${RED}Error: no se contacta coordinador-nacional en $COORD_URL${NC}"
  echo -e "${RED}Levanta primero: docker compose up --build -d${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Nodos disponibles${NC}"
echo ""

# --- 1. Donante (1 bloque) ---
echo -e "${YELLOW}[2] donor-registry → 1 bloque (firma hospital-donante)${NC}"
DONOR_PAYLOAD='{
  "donorId":"'"$DONOR_ID"'",
  "bloodType":"O+",
  "hlaProfile":{"A":"A2","B":"B7","DR":"DR5"},
  "organType":"kidney",
  "preservationMethod":"static-cold"
}'

DONOR_SIG=$(curl -s -X POST "$DONANTE_URL/sign" \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$DONOR_PAYLOAD}" | jq -r '.signature // empty')

if [[ -z "$DONOR_SIG" ]]; then
  echo -e "${RED}✗ Fallo al firmar donante${NC}"
  exit 1
fi

DONOR_TX=$(curl -s -X POST "$DONANTE_URL/tx/donor-registry" \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\":$DONOR_PAYLOAD,
    \"signatures\":[{\"actor\":\"hospital-donante\",\"signature\":\"$DONOR_SIG\"}]
  }")
require_ok "donor-registry" "$DONOR_TX"
echo -e "${GREEN}✓ Donante registrado: $DONOR_ID${NC}"
sleep 1

add_waiting_list() {
  local payload="$1"
  local label="$2"
  local coord_sig hosp_sig tx
  coord_sig=$(curl -s -X POST "$COORD_URL/sign" \
    -H "Content-Type: application/json" \
    -d "{\"payload\":$payload}" | jq -r '.signature // empty')
  hosp_sig=$(curl -s -X POST "$DONANTE_URL/sign" \
    -H "Content-Type: application/json" \
    -d "{\"payload\":$payload}" | jq -r '.signature // empty')
  if [[ -z "$coord_sig" || -z "$hosp_sig" ]]; then
    echo -e "${RED}✗ Fallo al firmar ${label}${NC}"
    exit 1
  fi
  tx=$(curl -s -X POST "$COORD_URL/tx/waiting-list" \
    -H "Content-Type: application/json" \
    -d "{
      \"payload\":$payload,
      \"signatures\":[
        {\"actor\":\"coordinador-nacional\",\"signature\":\"$coord_sig\"},
        {\"actor\":\"hospital-donante\",\"signature\":\"$hosp_sig\"}
      ]
    }")
  require_ok "waiting-list ${label}" "$tx"
  echo -e "${GREEN}✓ En lista: ${label}${NC}"
  sleep 1
}

# --- 2. Lista de espera (3 bloques, 2 firmas cada uno) ---
# Donante: O+ / A2 · B7 · DR5
# Ranking del motor: sangre (O+ dona a todos) → score HLA (loci A,B,DR) → urgencia.
#   001: O+ A2 B7 DR4 urg 4 → HLA 67 (2/3)  ← se asigna
#   003: O+ A2 B44 DR11 urg 2 → HLA 33 (1/3)
#   002: A+ A1 B8 DR3 urg 5 → HLA 0 (0/3), más urgente pero peor match
echo -e "${YELLOW}[3] waiting-list → 3 pacientes (coordinador-nacional + hospital-donante)${NC}"

PATIENT_PAYLOAD='{
  "patientId":"'"$PATIENT_ID"'",
  "bloodType":"O+",
  "hlaProfile":{"A":"A2","B":"B7","DR":"DR4"},
  "urgencyLevel":4
}'
add_waiting_list "$PATIENT_PAYLOAD" "$PATIENT_ID (O+ HLA 2/3 urg 4 — será asignado)"

PATIENT_B_PAYLOAD='{
  "patientId":"'"$PATIENT_B_ID"'",
  "bloodType":"A+",
  "hlaProfile":{"A":"A1","B":"B8","DR":"DR3"},
  "urgencyLevel":5
}'
add_waiting_list "$PATIENT_B_PAYLOAD" "$PATIENT_B_ID (A+ HLA 0/3 urg 5 — queda en espera)"

PATIENT_C_PAYLOAD='{
  "patientId":"'"$PATIENT_C_ID"'",
  "bloodType":"O+",
  "hlaProfile":{"A":"A2","B":"B44","DR":"DR11"},
  "urgencyLevel":2
}'
add_waiting_list "$PATIENT_C_PAYLOAD" "$PATIENT_C_ID (O+ HLA 1/3 urg 2 — queda en espera)"

# --- 3. Compatibilidad HLA + assignment (1 bloque, 2 firmas) ---
echo -e "${YELLOW}[4] compatibility/query (no escribe bloques)${NC}"
COMPAT_RESPONSE=$(curl -s -X POST "$DONANTE_URL/compatibility/query" \
  -H "Content-Type: application/json" \
  -d "{
    \"donorProfile\":{\"bloodType\":\"O+\",\"hlaProfile\":{\"A\":\"A2\",\"B\":\"B7\",\"DR\":\"DR5\"}},
    \"waitingList\":[
      {\"patientId\":\"$PATIENT_ID\",\"bloodType\":\"O+\",\"hlaProfile\":{\"A\":\"A2\",\"B\":\"B7\",\"DR\":\"DR4\"},\"urgencyLevel\":4},
      {\"patientId\":\"$PATIENT_B_ID\",\"bloodType\":\"A+\",\"hlaProfile\":{\"A\":\"A1\",\"B\":\"B8\",\"DR\":\"DR3\"},\"urgencyLevel\":5},
      {\"patientId\":\"$PATIENT_C_ID\",\"bloodType\":\"O+\",\"hlaProfile\":{\"A\":\"A2\",\"B\":\"B44\",\"DR\":\"DR11\"},\"urgencyLevel\":2}
    ]
  }")

COMPAT_TS=$(echo "$COMPAT_RESPONSE" | jq -r '.compatibilityTimestamp // empty')
CHOSEN=$(echo "$COMPAT_RESPONSE" | jq -r '.rankedCandidates[0].patientId // empty')
HLA_SCORE=$(echo "$COMPAT_RESPONSE" | jq -r '.rankedCandidates[0].hlaScore // empty')
if [[ -z "$COMPAT_TS" || "$CHOSEN" != "$PATIENT_ID" ]]; then
  echo -e "${RED}✗ Fallo /compatibility/query (elegido='$CHOSEN', se esperaba $PATIENT_ID)${NC}"
  echo "$COMPAT_RESPONSE" | jq . 2>/dev/null || echo "$COMPAT_RESPONSE"
  exit 1
fi
echo -e "${GREEN}✓ Ranking:${NC}"
echo "$COMPAT_RESPONSE" | jq -r '.rankedCandidates[] | "    \(.patientId)  HLA \(.hlaScore)  urgencia \(.urgencyLevel)"'
echo -e "${GREEN}✓ Se asigna $CHOSEN (mejor HLA). compatibilityTimestamp=$COMPAT_TS${NC}"
echo ""

echo -e "${YELLOW}[5] assignment → 1 bloque (coordinador-nacional + hospital-donante)${NC}"
echo -e "${YELLOW}    Este bloque ES el inicio de trazabilidad del órgano.${NC}"
ASSIGNMENT_PAYLOAD='{
  "donorId":"'"$DONOR_ID"'",
  "recipientId":"'"$PATIENT_ID"'",
  "organ":"kidney",
  "compatibilityTimestamp":"'"$COMPAT_TS"'",
  "hlaScore":'"${HLA_SCORE:-66.66666666666666}"'
}'

COORD_ASSIGN_SIG=$(curl -s -X POST "$COORD_URL/sign" \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$ASSIGNMENT_PAYLOAD}" | jq -r '.signature // empty')

HOSP_ASSIGN_SIG=$(curl -s -X POST "$DONANTE_URL/sign" \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$ASSIGNMENT_PAYLOAD}" | jq -r '.signature // empty')

if [[ -z "$COORD_ASSIGN_SIG" || -z "$HOSP_ASSIGN_SIG" ]]; then
  echo -e "${RED}✗ Fallo al firmar asignación${NC}"
  exit 1
fi

ASSIGN_TX=$(curl -s -X POST "$DONANTE_URL/tx/assignment" \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\":$ASSIGNMENT_PAYLOAD,
    \"signatures\":[
      {\"actor\":\"coordinador-nacional\",\"signature\":\"$COORD_ASSIGN_SIG\"},
      {\"actor\":\"hospital-donante\",\"signature\":\"$HOSP_ASSIGN_SIG\"}
    ]
  }")
require_ok "assignment" "$ASSIGN_TX"
echo -e "${GREEN}✓ Asignación creada (órgano en condiciones de transitar)${NC}"
sleep 2

# --- 4. Traslado IoT (lecturas acotadas) y recepción ---
echo ""
echo -e "${YELLOW}[6] Arrancando iot-simulator (profile iot, organId=$DONOR_ID)...${NC}"
cd "$REPO_ROOT"
docker compose --profile iot stop iot-simulator >/dev/null 2>&1 || true
if ORGAN_ID="$DONOR_ID" docker compose --profile iot up -d iot-simulator; then
  echo -e "${GREEN}✓ IoT arriba. Escribe custody hasta la recepción.${NC}"
else
  echo -e "${RED}✗ No se pudo levantar iot-simulator${NC}"
  echo "Manual: ORGAN_ID=$DONOR_ID docker compose --profile iot up -d iot-simulator"
  exit 1
fi

MIN_CUSTODY=80
echo -e "${YELLOW}[7] Esperando $MIN_CUSTODY lecturas (1 cada 5 s; envío comprimido)...${NC}"
READINGS=0
for _ in $(seq 1 80); do
  READINGS="$(curl -s -H "x-actor: coordinador-nacional" "$COORD_URL/dashboard/overview" | jq -r '.counts.custodyReadings // 0')"
  echo "    lecturas en ledger: $READINGS / $MIN_CUSTODY"
  if [[ "$READINGS" =~ ^[0-9]+$ ]] && [[ "$READINGS" -ge "$MIN_CUSTODY" ]]; then
    break
  fi
  sleep 3
done
if ! [[ "$READINGS" =~ ^[0-9]+$ ]] || [[ "$READINGS" -lt "$MIN_CUSTODY" ]]; then
  echo -e "${RED}✗ El IoT no escribió $MIN_CUSTODY lecturas a tiempo (hay $READINGS)${NC}"
  echo "Revisá: docker compose logs iot-simulator"
  exit 1
fi
echo -e "${GREEN}✓ Traslado registrado ($READINGS lecturas)${NC}"

echo ""
echo -e "${YELLOW}[8] reception → 1 bloque (hospital-receptor + coordinador-nacional)${NC}"
RECEPTION_PAYLOAD='{
  "donorId":"'"$DONOR_ID"'",
  "organId":"'"$DONOR_ID"'",
  "recipientId":"'"$PATIENT_ID"'",
  "hospital":"hospital-receptor"
}'

COORD_RX_SIG=$(curl -s -X POST "$COORD_URL/sign" \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$RECEPTION_PAYLOAD}" | jq -r '.signature // empty')

RECEPTOR_RX_SIG=$(curl -s -X POST "$RECEPTOR_URL/sign" \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$RECEPTION_PAYLOAD}" | jq -r '.signature // empty')

if [[ -z "$COORD_RX_SIG" || -z "$RECEPTOR_RX_SIG" ]]; then
  echo -e "${RED}✗ Fallo al firmar recepción${NC}"
  exit 1
fi

RX_TX=$(curl -s -X POST "$RECEPTOR_URL/tx/reception" \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\":$RECEPTION_PAYLOAD,
    \"signatures\":[
      {\"actor\":\"hospital-receptor\",\"signature\":\"$RECEPTOR_RX_SIG\"},
      {\"actor\":\"coordinador-nacional\",\"signature\":\"$COORD_RX_SIG\"}
    ]
  }")
require_ok "reception" "$RX_TX"
echo -e "${GREEN}✓ Órgano recibido en hospital receptor. Circuito cerrado.${NC}"

echo -e "${YELLOW}[9] Deteniendo iot-simulator (el traslado terminó)...${NC}"
docker compose --profile iot stop iot-simulator >/dev/null 2>&1 || true
echo -e "${GREEN}✓ IoT detenido. No se escriben más bloques de custodia.${NC}"

HEIGHT=$(curl -s "$COORD_URL/health" | jq -r '.ledgerHeight // .ledgerBlocks // 0')

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ CASO CLÍNICO CERRADO${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Hechos en el ledger (replicados en los 4 nodos):"
echo "  1. donor-registry   $DONOR_ID"
echo "  2. waiting-list     $PATIENT_ID (asignado), $PATIENT_B_ID y $PATIENT_C_ID (en espera)"
echo "  3. assignment       $DONOR_ID → $PATIENT_ID"
echo "  4. custody          $READINGS lecturas (organId=$DONOR_ID)"
echo "  5. reception        hospital-receptor (cierre de trazabilidad)"
echo ""
echo "Altura actual (orderer): $HEIGHT  — estable: el IoT ya no escribe."
echo ""
echo "Dashboard clínico: http://localhost:3000/dashboard"
echo "Consultar:         $DONOR_ID"
echo ""
echo "Infra:             http://localhost:3000/infra"
echo ""
echo "Para empezar de cero:    ./scripts/reset.sh --force && docker compose up --build -d"
echo ""
