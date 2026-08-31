#!/usr/bin/env bash
# Setup Demo Pitch Data para INTEGRAlab
# Genera data demo-pitch-* para demostración ante jurado (READ-ONLY después de crear)
#
# Uso: bash scripts/setup-demo-pitch-data.sh
#
# Crea:
#  - 1 donante (demo-pitch-donor-001)
#  - 1 paciente (demo-pitch-patient-001)
#  - 1 asignación
#  - Telemetría simulada (temperatura en rango)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

COORD_URL="http://localhost:3001"
DONANTE_URL="http://localhost:3003"
RECEPTOR_URL="http://localhost:3004"

DONOR_ID="demo-pitch-donor-001"
PATIENT_ID="demo-pitch-patient-001"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}SETUP: Demo Pitch Data para Jurado${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Verificar que nodos están levantados
echo -e "${YELLOW}[1] Verificando que nodos estén levantados...${NC}"
if ! curl -s "$COORD_URL/health" > /dev/null 2>&1; then
  echo -e "${RED}Error: No se puede contactar coordinador-nacional en $COORD_URL${NC}"
  echo -e "${RED}Levanta los nodos primero: docker compose up${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Nodos disponibles${NC}"
echo ""

# 1. Registrar donante
echo -e "${YELLOW}[2] Registrando donante $DONOR_ID...${NC}"
DONOR_PAYLOAD='{
  "donorId":"'$DONOR_ID'",
  "bloodType":"O+",
  "hlaProfile":{"A":"A2","B":"B7","DR":"DR5"},
  "organType":"kidney",
  "preservationMethod":"static-cold"
}'

DONOR_SIG=$(curl -s -X POST "$DONANTE_URL/sign" \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$DONOR_PAYLOAD}" | jq -r '.signature // empty')

if [ -z "$DONOR_SIG" ]; then
  echo -e "${RED}✗ Fallo al firmar donante${NC}"
  exit 1
fi

curl -s -X POST "$DONANTE_URL/tx/donor-registry" \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\":$DONOR_PAYLOAD,
    \"signatures\":[{\"actor\":\"hospital-donante\",\"signature\":\"$DONOR_SIG\"}]
  }" > /dev/null

echo -e "${GREEN}✓ Donante registrado: $DONOR_ID${NC}"
sleep 1

# 2. Registrar paciente
echo -e "${YELLOW}[3] Registrando paciente $PATIENT_ID...${NC}"
PATIENT_PAYLOAD='{
  "patientId":"'$PATIENT_ID'",
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

if [ -z "$COORD_SIG" ] || [ -z "$PATIENT_SIG" ]; then
  echo -e "${RED}✗ Fallo al firmar paciente${NC}"
  exit 1
fi

curl -s -X POST "$COORD_URL/tx/waiting-list" \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\":$PATIENT_PAYLOAD,
    \"signatures\":[
      {\"actor\":\"coordinador-nacional\",\"signature\":\"$COORD_SIG\"},
      {\"actor\":\"hospital-donante\",\"signature\":\"$PATIENT_SIG\"}
    ]
  }" > /dev/null

echo -e "${GREEN}✓ Paciente en lista espera: $PATIENT_ID${NC}"
sleep 1

# 3. Crear asignación
echo -e "${YELLOW}[4] Creando asignación...${NC}"
ASSIGNMENT_PAYLOAD='{
  "assignmentId":"demo-pitch-assign-001",
  "donorId":"'$DONOR_ID'",
  "patientId":"'$PATIENT_ID'",
  "organType":"kidney",
  "timestamp":"2026-08-31T12:00:00Z",
  "transportMethod":"direct-to-receptor"
}'

ASSIGN_SIG=$(curl -s -X POST "$COORD_URL/sign" \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$ASSIGNMENT_PAYLOAD}" | jq -r '.signature // empty')

if [ -z "$ASSIGN_SIG" ]; then
  echo -e "${RED}✗ Fallo al firmar asignación${NC}"
  exit 1
fi

curl -s -X POST "$COORD_URL/tx/assignment" \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\":$ASSIGNMENT_PAYLOAD,
    \"signatures\":[{\"actor\":\"coordinador-nacional\",\"signature\":\"$ASSIGN_SIG\"}]
  }" > /dev/null

echo -e "${GREEN}✓ Asignación creada${NC}"
sleep 1

# 4. Inyectar telemetría demo
echo -e "${YELLOW}[5] Inyectando telemetría de custodia...${NC}"

for i in {1..5}; do
  TEMP=$((4 - (i - 1) / 2))
  TELEM_PAYLOAD='{
    "deviceId":"sensor-contenedor-001",
    "timestamp":"2026-08-31T12:0'$i':00.000Z",
    "nonce":"demo-pitch-'$i'",
    "sensorType":"temperature",
    "value":'$TEMP',
    "unit":"celsius",
    "organId":"'$DONOR_ID'"
  }'

  TELEM_SIG=$(curl -s -X POST "$DONANTE_URL/sign" \
    -H "Content-Type: application/json" \
    -d "{\"payload\":$TELEM_PAYLOAD}" | jq -r '.signature // empty')

  if [ -n "$TELEM_SIG" ]; then
    curl -s -X POST "$DONANTE_URL/tx/custody" \
      -H "Content-Type: application/json" \
      -d "{
        \"payload\":$TELEM_PAYLOAD,
        \"signatures\":[{\"actor\":\"hospital-donante\",\"signature\":\"$TELEM_SIG\"}]
      }" > /dev/null
    echo -e "  ✓ Telemetría $i ($TEMP°C)"
  fi

  sleep 0.5
done

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ SETUP COMPLETADO${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Data demo-pitch-* creada en el ledger:"
echo "  • Donante: $DONOR_ID"
echo "  • Paciente: $PATIENT_ID"
echo "  • Asignación: demo-pitch-assign-001"
echo "  • Telemetría: 5 lecturas (4°C cada una)"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANTE: Esta data es READ-ONLY para demo.${NC}"
echo "No modifiques después de crear. Para limpieza:"
echo "  ./scripts/reset.sh --force && docker compose up --build"
echo ""
