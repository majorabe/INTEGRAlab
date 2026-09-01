#!/usr/bin/env bash
# Setup Demo Pitch Data para INTEGRAlab
#
# Escribe los HECHOS CLÍNICOS en el ledger (cada uno = 1 bloque replicado):
#   1. donor-registry      → donante demo-pitch-donor-001
#   2. waiting-list        → paciente demo-pitch-patient-001
#   3. assignment          → vínculo donante↔paciente (inicio de trazabilidad)
# Después arranca el IoT (profile compose `iot`). El simulador espera el
# assignment y recién ahí graba bloques custody con organId = donorId.
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

DONOR_ID="demo-pitch-donor-001"
PATIENT_ID="demo-pitch-patient-001"

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
echo -e "${BLUE}SETUP: caso clínico demo-pitch${NC}"
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

# --- 2. Lista de espera (1 bloque, 2 firmas) ---
echo -e "${YELLOW}[3] waiting-list → 1 bloque (coordinador-nacional + hospital-donante)${NC}"
PATIENT_PAYLOAD='{
  "patientId":"'"$PATIENT_ID"'",
  "bloodType":"O+",
  "hlaProfile":{"A":"A2","B":"B7","DR":"DR4"},
  "urgencyLevel":3
}'

COORD_SIG=$(curl -s -X POST "$COORD_URL/sign" \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$PATIENT_PAYLOAD}" | jq -r '.signature // empty')

PATIENT_SIG=$(curl -s -X POST "$DONANTE_URL/sign" \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$PATIENT_PAYLOAD}" | jq -r '.signature // empty')

if [[ -z "$COORD_SIG" || -z "$PATIENT_SIG" ]]; then
  echo -e "${RED}✗ Fallo al firmar paciente${NC}"
  exit 1
fi

PATIENT_TX=$(curl -s -X POST "$COORD_URL/tx/waiting-list" \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\":$PATIENT_PAYLOAD,
    \"signatures\":[
      {\"actor\":\"coordinador-nacional\",\"signature\":\"$COORD_SIG\"},
      {\"actor\":\"hospital-donante\",\"signature\":\"$PATIENT_SIG\"}
    ]
  }")
require_ok "waiting-list" "$PATIENT_TX"
echo -e "${GREEN}✓ Paciente en lista de espera: $PATIENT_ID${NC}"
sleep 1

# --- 3. Compatibilidad HLA + assignment (1 bloque, 2 firmas) ---
echo -e "${YELLOW}[4] compatibility/query (no escribe bloques)${NC}"
COMPAT_RESPONSE=$(curl -s -X POST "$DONANTE_URL/compatibility/query" \
  -H "Content-Type: application/json" \
  -d "{
    \"donorProfile\":{\"bloodType\":\"O+\",\"hlaProfile\":{\"A\":\"A2\",\"B\":\"B7\",\"DR\":\"DR5\"}},
    \"waitingList\":[{\"patientId\":\"$PATIENT_ID\",\"bloodType\":\"O+\",\"hlaProfile\":{\"A\":\"A2\",\"B\":\"B7\",\"DR\":\"DR4\"},\"urgencyLevel\":3}]
  }")

COMPAT_TS=$(echo "$COMPAT_RESPONSE" | jq -r '.compatibilityTimestamp // empty')
if [[ -z "$COMPAT_TS" ]]; then
  echo -e "${RED}✗ Fallo /compatibility/query${NC}"
  echo "$COMPAT_RESPONSE"
  exit 1
fi
echo -e "${GREEN}✓ compatibilityTimestamp=$COMPAT_TS${NC}"
echo ""

echo -e "${YELLOW}[5] assignment → 1 bloque (coordinador-nacional + hospital-donante)${NC}"
echo -e "${YELLOW}    Este bloque ES el inicio de trazabilidad del órgano.${NC}"
ASSIGNMENT_PAYLOAD='{
  "donorId":"'"$DONOR_ID"'",
  "recipientId":"'"$PATIENT_ID"'",
  "organ":"kidney",
  "compatibilityTimestamp":"'"$COMPAT_TS"'"
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

# --- 4. Arrancar IoT: a partir de acá, 1 bloque custody cada 5s ---
echo ""
echo -e "${YELLOW}[6] Arrancando iot-simulator (profile iot, organId=$DONOR_ID)...${NC}"
cd "$REPO_ROOT"
if ORGAN_ID="$DONOR_ID" docker compose --profile iot up -d iot-simulator; then
  echo -e "${GREEN}✓ IoT arriba. Espera el assignment y luego escribe custody cada 5s.${NC}"
else
  echo -e "${RED}✗ No se pudo levantar iot-simulator${NC}"
  echo "Manual: ORGAN_ID=$DONOR_ID docker compose --profile iot up -d iot-simulator"
  exit 1
fi

HEIGHT=$(curl -s "$COORD_URL/health" | jq -r '.ledgerHeight // .ledgerBlocks // 0')

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ CASO CLÍNICO LISTO${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Hechos en el ledger (replicados en los 4 nodos):"
echo "  1. donor-registry   $DONOR_ID"
echo "  2. waiting-list     $PATIENT_ID"
echo "  3. assignment       $DONOR_ID → $PATIENT_ID"
echo "  4. custody          en curso (IoT, organId=$DONOR_ID)"
echo ""
echo "Altura actual (orderer): $HEIGHT  — va a subir cada ~5s mientras el IoT corra."
echo ""
echo "Dashboard clínico: http://localhost:3000/dashboard"
echo "Consultar:         $DONOR_ID"
echo ""
echo "Infra (misma cadena, sin proyección clínica): http://localhost:3000/infra"
echo ""
echo "Para cortar telemetría:  docker compose stop iot-simulator"
echo "Para empezar de cero:    ./scripts/reset.sh --force && docker compose up --build -d"
echo ""
