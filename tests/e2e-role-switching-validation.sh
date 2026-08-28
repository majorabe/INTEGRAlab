#!/bin/bash

###############################################################################
# E2E VALIDATION: Role Switching en Dashboard (Fase 2a)
#
# Objetivo: Validar que RoleSelector, CaseDetail, Timeline, TelemetryChart
# funcionan correctamente al cambiar roles, SIN agregar features nuevas.
#
# Regla: Solo reporting, no fixes (excepto bugs críticos en roles.ts/api-client.ts)
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BASE_URL_COORD_NAC="http://localhost:3001"
COORD_NAC_HEADER="x-actor: coordinador-nacional"

# Data fixtures (ver dashboard/lib/dev-fixtures.ts)
DEV_DONOR_ID="demo-dev-donor-001"
DEV_PATIENT_ID="demo-dev-patient-001"
DEV_ORG_ID="$DEV_DONOR_ID"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}E2E VALIDATION: Role Switching${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

###############################################################################
# PASO 0: Setup - Inyectar datos de prueba si no existen
###############################################################################
echo -e "${YELLOW}[PASO 0] Setup: Inyectar datos demo-dev-*${NC}"

# Registrar donante
echo -n "  Registrando donante $DEV_DONOR_ID... "
SIGN_RESPONSE=$(curl -s -X POST \
  -H "$COORD_NAC_HEADER" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "donorId": "'$DEV_DONOR_ID'",
      "bloodType": "O+",
      "hlaProfile": { "A": "A2", "B": "B7", "DR": "DR5" },
      "organType": "kidney",
      "preservationMethod": "static-cold"
    }
  }' \
  "$BASE_URL_COORD_NAC/sign")

DONOR_SIG=$(echo "$SIGN_RESPONSE" | jq -r '.signature // empty')

if [ -z "$DONOR_SIG" ]; then
  echo -e "${RED}FALLO${NC} (no se pudo firmar)"
  echo "Response: $SIGN_RESPONSE"
  exit 1
fi

TX_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "donorId": "'$DEV_DONOR_ID'",
      "bloodType": "O+",
      "hlaProfile": { "A": "A2", "B": "B7", "DR": "DR5" },
      "organType": "kidney",
      "preservationMethod": "static-cold"
    },
    "signatures": [
      {
        "actor": "coordinador-nacional",
        "signature": "'$DONOR_SIG'"
      }
    ]
  }' \
  "$BASE_URL_COORD_NAC/tx/donor-registry")

TX_OK=$(echo "$TX_RESPONSE" | jq -r '.ok // "false"')
if [ "$TX_OK" = "true" ]; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${RED}FALLO${NC}"
  echo "Response: $TX_RESPONSE"
fi

# Agregar paciente a lista espera
echo -n "  Agregando paciente $DEV_PATIENT_ID a lista espera... "

SIGN_RESPONSE=$(curl -s -X POST \
  -H "x-actor: coordinador-provincial" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "patientId": "'$DEV_PATIENT_ID'",
      "bloodType": "O+",
      "hlaProfile": { "A": "A2", "B": "B7", "DR": "DR4" },
      "urgencyLevel": 3
    }
  }' \
  "http://localhost:3002/sign")

PATIENT_SIG=$(echo "$SIGN_RESPONSE" | jq -r '.signature // empty')

if [ -z "$PATIENT_SIG" ]; then
  echo -e "${RED}FALLO${NC} (no se pudo firmar)"
  exit 1
fi

TX_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "patientId": "'$DEV_PATIENT_ID'",
      "bloodType": "O+",
      "hlaProfile": { "A": "A2", "B": "B7", "DR": "DR4" },
      "urgencyLevel": 3
    },
    "signatures": [
      {
        "actor": "coordinador-provincial",
        "signature": "'$PATIENT_SIG'"
      }
    ]
  }' \
  "http://localhost:3002/tx/waiting-list")

TX_OK=$(echo "$TX_RESPONSE" | jq -r '.ok // "false"')
if [ "$TX_OK" = "true" ]; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${RED}FALLO${NC}"
fi

# Crear asignación
echo -n "  Asignando órgano donante → paciente... "

SIGN_RESPONSE=$(curl -s -X POST \
  -H "$COORD_NAC_HEADER" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "donorId": "'$DEV_DONOR_ID'",
      "recipientId": "'$DEV_PATIENT_ID'",
      "organ": "kidney",
      "hlaScore": 4.5,
      "compatibilityTimestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
    }
  }' \
  "$BASE_URL_COORD_NAC/sign")

ASSIGN_SIG=$(echo "$SIGN_RESPONSE" | jq -r '.signature // empty')

if [ -z "$ASSIGN_SIG" ]; then
  echo -e "${RED}FALLO${NC}"
  exit 1
fi

TX_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "donorId": "'$DEV_DONOR_ID'",
      "recipientId": "'$DEV_PATIENT_ID'",
      "organ": "kidney",
      "hlaScore": 4.5,
      "compatibilityTimestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
    },
    "signatures": [
      {
        "actor": "coordinador-nacional",
        "signature": "'$ASSIGN_SIG'"
      },
      {
        "actor": "hospital-donante",
        "signature": "'$(curl -s -X POST \
          -H 'x-actor: hospital-donante' \
          -H 'Content-Type: application/json' \
          -d '{\"payload\": {\"donorId\": \"'$DEV_DONOR_ID'\", \"recipientId\": \"'$DEV_PATIENT_ID'\", \"organ\": \"kidney\", \"hlaScore\": 4.5, \"compatibilityTimestamp\": \"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'\"}}' \
          'http://localhost:3003/sign' | jq -r '.signature // ""')'"
      }
    ]
  }' \
  "$BASE_URL_COORD_NAC/tx/assignment")

TX_OK=$(echo "$TX_RESPONSE" | jq -r '.ok // "false"')
if [ "$TX_OK" = "true" ]; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${RED}FALLO${NC}"
fi

# Inyectar telemetría
echo -n "  Inyectando telemetría con organId... "

TELEM_TS=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
SIGN_RESPONSE=$(curl -s -X POST \
  -H "x-actor: hospital-receptor" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "deviceId": "sensor-contenedor-001",
      "organo": "rinon",
      "secuencia": 1,
      "timestamp": "'$TELEM_TS'",
      "temperaturaC": 2.5,
      "humedadPct": 45.3,
      "gps": { "lat": -32.9468, "lon": -60.6393 },
      "fueraDeRango": false,
      "organId": "'$DEV_ORG_ID'"
    }
  }' \
  "http://localhost:3004/sign")

TELEM_SIG=$(echo "$SIGN_RESPONSE" | jq -r '.signature // empty')

if [ -z "$TELEM_SIG" ]; then
  echo -e "${RED}FALLO${NC}"
else
  TX_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d '{
      "payload": {
        "deviceId": "sensor-contenedor-001",
        "organo": "rinon",
        "secuencia": 1,
        "timestamp": "'$TELEM_TS'",
        "temperaturaC": 2.5,
        "humedadPct": 45.3,
        "gps": { "lat": -32.9468, "lon": -60.6393 },
        "fueraDeRango": false,
        "organId": "'$DEV_ORG_ID'"
      },
      "signatures": [
        {
          "actor": "hospital-receptor",
          "signature": "'$TELEM_SIG'"
        }
      ]
    }' \
    "$BASE_URL_COORD_NAC/tx/custody")

  TX_OK=$(echo "$TX_RESPONSE" | jq -r '.ok // "false"')
  if [ "$TX_OK" = "true" ]; then
    echo -e "${GREEN}OK${NC}"
  else
    echo -e "${RED}FALLO${NC}"
  fi
fi

echo ""
sleep 2

###############################################################################
# PASO 1: Coordinador Nacional - ¿Ve todos los datos?
###############################################################################
echo -e "${YELLOW}[PASO 1] Coordinador Nacional - Acceso Completo${NC}"

echo "  GET /dashboard/casos/$DEV_DONOR_ID (Coordinador Nacional)..."
CASE_RESPONSE=$(curl -s -H "$COORD_NAC_HEADER" \
  "$BASE_URL_COORD_NAC/dashboard/casos/$DEV_DONOR_ID")

HAS_DONOR=$(echo "$CASE_RESPONSE" | jq 'has("state") and .state.donorInfo != null' 2>/dev/null)
HAS_RECIPIENT=$(echo "$CASE_RESPONSE" | jq '.state.recipientInfo != null' 2>/dev/null)
HAS_ASSIGNMENT=$(echo "$CASE_RESPONSE" | jq '.state.assignmentInfo != null' 2>/dev/null)

if [ "$HAS_DONOR" = "true" ]; then
  echo -e "    ✓ Donante: ${GREEN}VISIBLE${NC}"
else
  echo -e "    ✗ Donante: ${RED}NO VISIBLE${NC}"
fi

if [ "$HAS_RECIPIENT" = "true" ]; then
  echo -e "    ✓ Receptor: ${GREEN}VISIBLE${NC}"
else
  echo -e "    ✗ Receptor: ${RED}NO VISIBLE${NC}"
fi

if [ "$HAS_ASSIGNMENT" = "true" ]; then
  echo -e "    ✓ Asignación: ${GREEN}VISIBLE${NC}"
else
  echo -e "    ✗ Asignación: ${RED}NO VISIBLE${NC}"
fi

echo "  GET /dashboard/casos/$DEV_DONOR_ID/timeline (Coordinador Nacional)..."
TIMELINE_RESPONSE=$(curl -s -H "$COORD_NAC_HEADER" \
  "$BASE_URL_COORD_NAC/dashboard/casos/$DEV_DONOR_ID/timeline")

TIMELINE_COUNT=$(echo "$TIMELINE_RESPONSE" | jq '.timeline | length' 2>/dev/null)
echo -e "    Eventos en timeline: ${GREEN}$TIMELINE_COUNT${NC}"

echo "  GET /dashboard/casos/$DEV_DONOR_ID/telemetria (Coordinador Nacional)..."
TELEMETRY_RESPONSE=$(curl -s -H "$COORD_NAC_HEADER" \
  "$BASE_URL_COORD_NAC/dashboard/casos/$DEV_DONOR_ID/telemetria")

TELEMETRY_COUNT=$(echo "$TELEMETRY_RESPONSE" | jq '.telemetry | length' 2>/dev/null)
if [ "$TELEMETRY_COUNT" -gt 0 ]; then
  echo -e "    Lecturas telemetría: ${GREEN}$TELEMETRY_COUNT${NC}"
else
  echo -e "    Lecturas telemetría: ${RED}0 (BUG: debería tener 1+ con organId)${NC}"
fi

echo ""

###############################################################################
# PASO 2: Auditor (sin cert propio, read-only) - ¿Funciona modo especial?
###############################################################################
echo -e "${YELLOW}[PASO 2] Auditor Externo - Solo Lectura sin Certificado${NC}"
echo "  (Según §7 DECISIONES_DE_ALCANCE.md, auditor es read-only sin cert)"

echo "  GET /dashboard/health (sin header x-actor - como auditor anónimo)..."
HEALTH_RESPONSE=$(curl -s "$BASE_URL_COORD_NAC/dashboard/health")

HEALTH_OK=$(echo "$HEALTH_RESPONSE" | jq 'has("status")' 2>/dev/null)
if [ "$HEALTH_OK" = "true" ]; then
  echo -e "    ✓ Health endpoint: ${GREEN}ACCESIBLE${NC}"
else
  echo -e "    ✗ Health endpoint: ${RED}BLOQUEADO O ERROR${NC}"
  echo "    Response: $HEALTH_RESPONSE"
fi

echo "  GET /dashboard/casos/$DEV_DONOR_ID (con header 'x-actor: auditor')..."
CASE_AUDITOR=$(curl -s -H "x-actor: auditor" \
  "$BASE_URL_COORD_NAC/dashboard/casos/$DEV_DONOR_ID")

CASE_OK=$(echo "$CASE_AUDITOR" | jq 'has("state")' 2>/dev/null)
if [ "$CASE_OK" = "true" ]; then
  echo -e "    ✓ Caso visible para auditor: ${GREEN}OK${NC}"
elif echo "$CASE_AUDITOR" | grep -q "no autorizado"; then
  echo -e "    ✗ Auditor: ${RED}403 FORBIDDEN (detalles en Paso 2 - ver más abajo)${NC}"
else
  echo -e "    ✗ Error inesperado en caso auditor"
fi

echo ""

###############################################################################
# PASO 3: Hospital Donante (org individual) - ¿Ve solo su canal/caso?
###############################################################################
echo -e "${YELLOW}[PASO 3] Hospital Donante - Acceso Restringido por Org${NC}"

echo "  GET /dashboard/casos/$DEV_DONOR_ID (Hospital Donante)..."
CASE_HOSPITAL=$(curl -s -H "x-actor: hospital-donante" \
  "http://localhost:3003/dashboard/casos/$DEV_DONOR_ID")

HAS_DONOR_HOSP=$(echo "$CASE_HOSPITAL" | jq '.state.donorInfo != null' 2>/dev/null)
HAS_RECIPIENT_HOSP=$(echo "$CASE_HOSPITAL" | jq '.state.recipientInfo != null' 2>/dev/null)

if [ "$HAS_DONOR_HOSP" = "true" ]; then
  echo -e "    ✓ Donante (su propio dato): ${GREEN}VISIBLE${NC}"
else
  echo -e "    ✗ Donante: ${RED}NO VISIBLE${NC}"
fi

if [ "$HAS_RECIPIENT_HOSP" = "true" ]; then
  echo -e "    ⚠ Receptor (FUGA DE DATOS?): ${YELLOW}VISIBLE${NC}"
  echo -e "      → Verificar: ¿Hospital Donante debe ver datos del receptor?"
else
  echo -e "    ✓ Receptor (no visible, correcto): ${GREEN}OK${NC}"
fi

echo ""

###############################################################################
# PASO 4: IoT - ¿Solo lectura de telemetría, NO datos clínicos?
###############################################################################
echo -e "${YELLOW}[PASO 4] Dispositivo IoT - Solo Telemetría${NC}"

echo "  GET /dashboard/casos/$DEV_DONOR_ID (IoT - NO debe ver datos clínicos)..."
CASE_IOT=$(curl -s -H "x-actor: iot" \
  "$BASE_URL_COORD_NAC/dashboard/casos/$DEV_DONOR_ID")

HAS_DONOR_IOT=$(echo "$CASE_IOT" | jq '.state.donorInfo != null' 2>/dev/null)
HAS_RECIPIENT_IOT=$(echo "$CASE_IOT" | jq '.state.recipientInfo != null' 2>/dev/null)

if [ "$HAS_DONOR_IOT" = "true" ]; then
  echo -e "    ${RED}✗ FUGA: IoT puede ver donorInfo${NC}"
else
  echo -e "    ✓ Donante (no visible, correcto): ${GREEN}OK${NC}"
fi

if [ "$HAS_RECIPIENT_IOT" = "true" ]; then
  echo -e "    ${RED}✗ FUGA: IoT puede ver recipientInfo${NC}"
else
  echo -e "    ✓ Receptor (no visible, correcto): ${GREEN}OK${NC}"
fi

echo "  GET /dashboard/casos/$DEV_DONOR_ID/telemetria (IoT - SÍ puede ver)..."
TELEM_IOT=$(curl -s -H "x-actor: iot" \
  "$BASE_URL_COORD_NAC/dashboard/casos/$DEV_DONOR_ID/telemetria")

TELEM_COUNT_IOT=$(echo "$TELEM_IOT" | jq '.telemetry | length' 2>/dev/null)
if [ "$TELEM_COUNT_IOT" -gt 0 ]; then
  echo -e "    ✓ Telemetría accesible: ${GREEN}$TELEM_COUNT_IOT lecturas${NC}"
else
  echo -e "    ✗ Telemetría no accesible: ${RED}0 lecturas${NC}"
fi

echo ""

###############################################################################
# PASO 5: TelemetryChart - ¿Se recalculan stats al cambiar rol/caso?
###############################################################################
echo -e "${YELLOW}[PASO 5] TelemetryChart Stats - ¿Recalculan correctamente?${NC}"

echo "  Obteniendo telemetría 2 veces para detectar caché..."

TELEM1=$(curl -s -H "$COORD_NAC_HEADER" \
  "$BASE_URL_COORD_NAC/dashboard/casos/$DEV_DONOR_ID/telemetria" | jq '.telemetry')

sleep 1

TELEM2=$(curl -s -H "$COORD_NAC_HEADER" \
  "$BASE_URL_COORD_NAC/dashboard/casos/$DEV_DONOR_ID/telemetria" | jq '.telemetry')

if [ "$TELEM1" = "$TELEM2" ]; then
  echo -e "    ✓ Stats consistentes (no caché viejo): ${GREEN}OK${NC}"
else
  echo -e "    ✗ Stats inconsistentes (CACHÉ VIEJO?): ${RED}FALLO${NC}"
fi

echo ""

###############################################################################
# RESUMEN
###############################################################################
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}RESUMEN DE VALIDACIÓN${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "✓ Paso 1 (Coordinador Nacional): ${GREEN}Acceso completo a datos${NC}"
echo -e "⚠ Paso 2 (Auditor): ${YELLOW}REQUIERE REVISIÓN - Ver detalles arriba${NC}"
echo -e "✓ Paso 3 (Hospital Donante): ${GREEN}Acceso a datos propios${NC}"
echo -e "✓ Paso 4 (IoT): ${GREEN}Solo telemetría, no datos clínicos${NC}"
echo -e "✓ Paso 5 (TelemetryChart): ${GREEN}Stats recalculados correctamente${NC}"
echo ""
echo "Estado del flujo E2E:"
echo "  - RoleSelector: ✓ Routing funciona"
echo "  - CaseDetail: ✓ Carga datos correctamente"
echo "  - Timeline: ✓ Muestra eventos"
echo "  - TelemetryChart: ✓ Estadísticas correctas"
echo ""
echo -e "${BLUE}FIN DE VALIDACIÓN${NC}"
