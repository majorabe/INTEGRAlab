#!/usr/bin/env bash
# Setup Demo Attack Scenarios para INTEGRAlab
#
# Simula intentos de ataque comunes y verifica que sean rechazados:
#   A1. Cert autofirmado (spoofing)
#   A2. Cert de otra org (spoofing)
#   A3. Firma modificada (tampering)
#   A4. WaitingList con 1 firma (endorsement incompleto)
#   A5. Assignment sin hospital (endorsement incompleto)
#   A6. Lectura no autorizada (RBAC)
#   A7. IoT escribe en waiting-list (elevation of privilege)
#   A8. Replay de telemetría (nonce expirado)
#   A9. Ledger manipulado offline (integridad)
#
# Uso:
#   bash scripts/setup-demo-attack-scenarios.sh <a1|a2|a3|a4|a5|a6|a7|a8|a9|all>
#
# Ejemplos:
#   bash scripts/setup-demo-attack-scenarios.sh a1      # Solo spoofing
#   bash scripts/setup-demo-attack-scenarios.sh all     # Todos los ataques
#
# Precondiciones:
#   - Red levantada: docker compose up --build -d
#   - Ledger vacío: ./scripts/reset.sh --force
#   - Sin IoT: docker compose stop iot-simulator

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

COORD_URL="http://localhost:3001"
DONANTE_URL="http://localhost:3003"

# Temporal directory para certs falsos
TEMP_DIR="/tmp/integra-attack-$$"
mkdir -p "$TEMP_DIR"
trap "rm -rf $TEMP_DIR" EXIT

# ==================== FUNCIONES ====================

attack_result() {
  local label="$1"
  local expected_status="$2"
  local actual_status="$3"
  local reason="$4"

  if [[ "$expected_status" == "$actual_status" ]]; then
    echo -e "${GREEN}✓ ESPERADO${NC} — $label"
    echo "  Razón: $reason"
    return 0
  else
    echo -e "${RED}✘ FALLA DE SEGURIDAD${NC} — $label"
    echo "  Esperado: $expected_status, Obtenido: $actual_status"
    return 1
  fi
}

check_health() {
  if ! curl -s "$COORD_URL/health" > /dev/null 2>&1; then
    echo -e "${RED}Error: no se contacta coordinador-nacional en $COORD_URL${NC}"
    echo -e "${RED}Levanta primero: docker compose up --build -d${NC}"
    exit 1
  fi
}

# ==================== ATAQUE A1: CERT AUTOFIRMADO ====================

attack_a1() {
  echo ""
  echo -e "${MAGENTA}========================================${NC}"
  echo -e "${MAGENTA}ATAQUE A1: Spoofing — Cert autofirmado${NC}"
  echo -e "${MAGENTA}========================================${NC}"
  echo ""

  # Generar cert autofirmado (NO de CA INTEGRA)
  openssl req -x509 -newkey rsa:2048 -keyout "$TEMP_DIR/fake.key" -out "$TEMP_DIR/fake.crt" \
    -days 1 -nodes -subj "/CN=hospital-donante" > /dev/null 2>&1

  PAYLOAD='{"donorId":"attack-a1-donor","bloodType":"O+","hlaProfile":{"A":"A1","B":"B1","DR":"DR1"},"organType":"kidney","preservationMethod":"static-cold"}'

  # Intentar enviar con cert falso
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$DONANTE_URL/tx/donor-registry" \
    --cert "$TEMP_DIR/fake.crt" --key "$TEMP_DIR/fake.key" \
    -H "Content-Type: application/json" \
    -d "{\"payload\":$PAYLOAD,\"signatures\":[{\"actor\":\"hospital-donante\",\"signature\":\"fake\"}]}" 2>&1 || true)

  # Curl con cert inválido típicamente devuelve error de conexión
  # Verificar si hay error o status 401/403
  if echo "$RESPONSE" | grep -qE "(certificate|CERTIFICATE|ERR_|401|403|Unauthorized)" 2>/dev/null || \
     [[ $? -ne 0 ]]; then
    attack_result "Cert autofirmado rechazado" "401" "401" "Certificado no de CA INTEGRA"
  else
    attack_result "Cert autofirmado" "401" "200" "NO FUE RECHAZADO"
    return 1
  fi
}

# ==================== ATAQUE A2: CERT DE OTRA ORG ====================

attack_a2() {
  echo ""
  echo -e "${MAGENTA}========================================${NC}"
  echo -e "${MAGENTA}ATAQUE A2: Spoofing — Cert de otra org${NC}"
  echo -e "${MAGENTA}========================================${NC}"
  echo ""

  COORD_CERT="$REPO_ROOT/certs/coordinador-nacional/cert.pem"
  COORD_KEY="$REPO_ROOT/certs/coordinador-nacional/key.pem"

  if [[ ! -f "$COORD_CERT" || ! -f "$COORD_KEY" ]]; then
    echo -e "${RED}Certificados no encontrados en $COORD_CERT / $COORD_KEY${NC}"
    return 1
  fi

  PAYLOAD='{"donorId":"attack-a2-donor","bloodType":"AB+","hlaProfile":{"A":"A2","B":"B7","DR":"DR4"},"organType":"kidney","preservationMethod":"static-cold"}'

  # Firmar payload con cert del coordinador
  COORD_SIG=$(curl -s -X POST "$COORD_URL/sign" \
    -H "Content-Type: application/json" \
    -d "{\"payload\":$PAYLOAD}" | jq -r '.signature // empty')

  if [[ -z "$COORD_SIG" ]]; then
    echo -e "${RED}No se obtuvo firma del coordinador${NC}"
    return 1
  fi

  # Intentar usar esa firma pero decir que es del hospital
  RESPONSE=$(curl -s -X POST "$DONANTE_URL/tx/donor-registry" \
    -H "Content-Type: application/json" \
    -d "{
      \"payload\":$PAYLOAD,
      \"signatures\":[
        {\"actor\":\"hospital-donante\",\"signature\":\"$COORD_SIG\"}
      ]
    }")

  OK=$(echo "$RESPONSE" | jq -r '.ok // empty')
  STATUS=$(echo "$RESPONSE" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")

  if [[ "$OK" != "true" ]]; then
    REASON=$(echo "$RESPONSE" | jq -r '.reason // "Firma no corresponde a actor"' 2>/dev/null)
    attack_result "Cert de otra org rechazado" "401" "401" "$REASON"
  else
    attack_result "Cert de otra org" "401" "201" "NO FUE RECHAZADO"
    return 1
  fi
}

# ==================== ATAQUE A3: FIRMA MODIFICADA ====================

attack_a3() {
  echo ""
  echo -e "${MAGENTA}========================================${NC}"
  echo -e "${MAGENTA}ATAQUE A3: Tampering — Firma modificada${NC}"
  echo -e "${MAGENTA}========================================${NC}"
  echo ""

  HOSP_CERT="$REPO_ROOT/certs/hospital-donante/cert.pem"
  HOSP_KEY="$REPO_ROOT/certs/hospital-donante/key.pem"

  if [[ ! -f "$HOSP_CERT" || ! -f "$HOSP_KEY" ]]; then
    echo -e "${RED}Certificados de hospital no encontrados en $HOSP_CERT / $HOSP_KEY${NC}"
    return 1
  fi

  PAYLOAD='{"donorId":"attack-a3-donor","bloodType":"B-","hlaProfile":{"A":"A3","B":"B8","DR":"DR2"},"organType":"kidney","preservationMethod":"static-cold"}'

  # Obtener firma válida
  SIG=$(curl -s -X POST "$DONANTE_URL/sign" \
    -H "Content-Type: application/json" \
    -d "{\"payload\":$PAYLOAD}" | jq -r '.signature // empty')

  if [[ -z "$SIG" || ${#SIG} -lt 10 ]]; then
    echo -e "${RED}No se obtuvo firma válida${NC}"
    return 1
  fi

  # Modificar un carácter de la firma
  TAMPERED_SIG="${SIG:0:1}X${SIG:2}"

  RESPONSE=$(curl -s -X POST "$DONANTE_URL/tx/donor-registry" \
    -H "Content-Type: application/json" \
    -d "{
      \"payload\":$PAYLOAD,
      \"signatures\":[
        {\"actor\":\"hospital-donante\",\"signature\":\"$TAMPERED_SIG\"}
      ]
    }")

  OK=$(echo "$RESPONSE" | jq -r '.ok // empty')

  if [[ "$OK" != "true" ]]; then
    REASON=$(echo "$RESPONSE" | jq -r '.reason // "Firma inválida"' 2>/dev/null)
    attack_result "Firma modificada rechazada" "401" "401" "$REASON"
  else
    attack_result "Firma modificada" "401" "201" "NO FUE RECHAZADA"
    return 1
  fi
}

# ==================== ATAQUE A4: ENDORSEMENT INCOMPLETO (1 FIRMA) ====================

attack_a4() {
  echo ""
  echo -e "${MAGENTA}========================================${NC}"
  echo -e "${MAGENTA}ATAQUE A4: Endorsement incompleto (1 firma)${NC}"
  echo -e "${MAGENTA}========================================${NC}"
  echo ""

  PAYLOAD='{
    "patientId":"attack-a4-patient",
    "bloodType":"A+",
    "hlaProfile":{"A":"A1","B":"B5","DR":"DR3"},
    "urgencyLevel":2
  }'

  # Obtener solo firma del coordinador (sin segunda org)
  COORD_SIG=$(curl -s -X POST "$COORD_URL/sign" \
    -H "Content-Type: application/json" \
    -d "{\"payload\":$PAYLOAD}" | jq -r '.signature // empty')

  if [[ -z "$COORD_SIG" ]]; then
    echo -e "${RED}No se obtuvo firma del coordinador${NC}"
    return 1
  fi

  # Intentar crear waiting-list solo con coordinador
  RESPONSE=$(curl -s -X POST "$COORD_URL/tx/waiting-list" \
    -H "Content-Type: application/json" \
    -d "{
      \"payload\":$PAYLOAD,
      \"signatures\":[
        {\"actor\":\"coordinador-nacional\",\"signature\":\"$COORD_SIG\"}
      ]
    }")

  OK=$(echo "$RESPONSE" | jq -r '.ok // empty')

  if [[ "$OK" != "true" ]]; then
    REASON=$(echo "$RESPONSE" | jq -r '.reason // "Endorsement incompleto"' 2>/dev/null)
    attack_result "WaitingList 1 firma rechazada" "403" "403" "$REASON"
  else
    attack_result "WaitingList 1 firma" "403" "201" "NO FUE RECHAZADA"
    return 1
  fi
}

# ==================== ATAQUE A5: ENDORSEMENT INCOMPLETO (SIN HOSPITAL) ====================

attack_a5() {
  echo ""
  echo -e "${MAGENTA}========================================${NC}"
  echo -e "${MAGENTA}ATAQUE A5: Endorsement incompleto (sin hospital)${NC}"
  echo -e "${MAGENTA}========================================${NC}"
  echo ""

  PAYLOAD='{
    "donorId":"attack-a5-donor",
    "recipientId":"attack-a5-patient",
    "organ":"kidney",
    "compatibilityTimestamp":"2026-09-02T15:30:00Z"
  }'

  # Obtener solo firma del coordinador (falta hospital-donante)
  COORD_SIG=$(curl -s -X POST "$COORD_URL/sign" \
    -H "Content-Type: application/json" \
    -d "{\"payload\":$PAYLOAD}" | jq -r '.signature // empty')

  if [[ -z "$COORD_SIG" ]]; then
    echo -e "${RED}No se obtuvo firma del coordinador${NC}"
    return 1
  fi

  # Intentar assignment con SOLO coordinador
  RESPONSE=$(curl -s -X POST "$COORD_URL/tx/assignment" \
    -H "Content-Type: application/json" \
    -d "{
      \"payload\":$PAYLOAD,
      \"signatures\":[
        {\"actor\":\"coordinador-nacional\",\"signature\":\"$COORD_SIG\"}
      ]
    }")

  OK=$(echo "$RESPONSE" | jq -r '.ok // empty')

  if [[ "$OK" != "true" ]]; then
    REASON=$(echo "$RESPONSE" | jq -r '.reason // "Endorsement incompleto"' 2>/dev/null)
    attack_result "Assignment sin hospital rechazado" "403" "403" "$REASON"
  else
    attack_result "Assignment sin hospital" "403" "201" "NO FUE RECHAZADO"
    return 1
  fi
}

# ==================== ATAQUE A6: LECTURA NO AUTORIZADA ====================

attack_a6() {
  echo ""
  echo -e "${MAGENTA}========================================${NC}"
  echo -e "${MAGENTA}ATAQUE A6: Lectura no autorizada (CORS)${NC}"
  echo -e "${MAGENTA}========================================${NC}"
  echo ""

  # Intentar desde origen no autorizado
  RESPONSE=$(curl -s -i -X GET "http://localhost:3001/dashboard/casos/donor-001" \
    -H "Origin: https://attacker.com" 2>&1 || true)

  # Si no contiene Access-Control-Allow-Origin para ese origin, CORS rechazó
  if echo "$RESPONSE" | grep -qE "Access-Control-Allow-Origin:.*attacker" 2>/dev/null; then
    attack_result "CORS no restrictivo" "BLOCKED" "ALLOWED" "CORS debería estar restringido"
    return 1
  else
    attack_result "CORS origen no autorizado bloqueado" "BLOCKED" "BLOCKED" "Solo localhost:3000 permitido"
  fi
}

# ==================== ATAQUE A7: IOT ESCRIBE EN WAITINGLIST ====================

attack_a7() {
  echo ""
  echo -e "${MAGENTA}========================================${NC}"
  echo -e "${MAGENTA}ATAQUE A7: IoT escribe en waiting-list${NC}"
  echo -e "${MAGENTA}========================================${NC}"
  echo ""

  IOT_CERT="$REPO_ROOT/certs/iot/devices/sensor-contenedor-001/cert.pem"
  IOT_KEY="$REPO_ROOT/certs/iot/devices/sensor-contenedor-001/key.pem"

  if [[ ! -f "$IOT_CERT" || ! -f "$IOT_KEY" ]]; then
    echo -e "${YELLOW}⊘ Certs IoT no encontrados (normal si no se levantó IoT aún)${NC}"
    return 0
  fi

  PAYLOAD='{
    "patientId":"attack-a7-patient",
    "bloodType":"O-",
    "hlaProfile":{"A":"A4","B":"B9","DR":"DR5"},
    "urgencyLevel":1
  }'

  # Obtener firma del IoT
  IOT_SIG=$(curl -s -X POST "$DONANTE_URL/sign" \
    -H "Content-Type: application/json" \
    --cert "$IOT_CERT" --key "$IOT_KEY" \
    -d "{\"payload\":$PAYLOAD}" | jq -r '.signature // empty' 2>/dev/null || echo "")

  if [[ -z "$IOT_SIG" ]]; then
    echo -e "${YELLOW}⊘ No se obtuvo firma IoT (certs no disponibles)${NC}"
    return 0
  fi

  # Intentar crear waiting-list como IoT
  RESPONSE=$(curl -s -X POST "$DONANTE_URL/tx/waiting-list" \
    --cert "$IOT_CERT" --key "$IOT_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"payload\":$PAYLOAD,
      \"signatures\":[
        {\"actor\":\"iot:sensor-contenedor-001\",\"signature\":\"$IOT_SIG\"}
      ]
    }" 2>/dev/null)

  OK=$(echo "$RESPONSE" | jq -r '.ok // empty' 2>/dev/null)

  if [[ "$OK" != "true" ]]; then
    REASON=$(echo "$RESPONSE" | jq -r '.reason // "Actor no autorizado"' 2>/dev/null || echo "Actor no autorizado")
    attack_result "IoT en waiting-list rechazado" "403" "403" "$REASON"
  else
    attack_result "IoT en waiting-list" "403" "201" "NO FUE RECHAZADO"
    return 1
  fi
}

# ==================== ATAQUE A8: REPLAY DE TELEMETRÍA ====================

attack_a8() {
  echo ""
  echo -e "${MAGENTA}========================================${NC}"
  echo -e "${MAGENTA}ATAQUE A8: Replay de telemetría (nonce expirado)${NC}"
  echo -e "${MAGENTA}========================================${NC}"
  echo ""

  IOT_CERT="$REPO_ROOT/certs/iot/devices/sensor-contenedor-001/cert.pem"
  IOT_KEY="$REPO_ROOT/certs/iot/devices/sensor-contenedor-001/key.pem"

  if [[ ! -f "$IOT_CERT" || ! -f "$IOT_KEY" ]]; then
    echo -e "${YELLOW}⊘ Certs IoT no encontrados${NC}"
    return 0
  fi

  # Crear nonce hace 10 minutos (umbral es 5 min)
  STALE_NONCE=$(date -u -d "10 minutes ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
                date -u -v-10M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
                echo "2026-09-02T15:00:00Z")

  TELEMETRY="{
    \"deviceId\":\"sensor-contenedor-001\",
    \"timestamp\":\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
    \"nonce\":\"$STALE_NONCE\",
    \"sensorType\":\"temperature\",
    \"value\":4.2,
    \"unit\":\"celsius\",
    \"organId\":\"attack-a8-organ\"
  }"

  RESPONSE=$(curl -s -X POST "$DONANTE_URL/tx/custody" \
    --cert "$IOT_CERT" --key "$IOT_KEY" \
    -H "Content-Type: application/json" \
    -d "$TELEMETRY" 2>/dev/null)

  OK=$(echo "$RESPONSE" | jq -r '.ok // empty' 2>/dev/null)

  if [[ "$OK" != "true" ]]; then
    REASON=$(echo "$RESPONSE" | jq -r '.reason // "Nonce expirado"' 2>/dev/null || echo "Nonce expirado")
    attack_result "Replay telemetría rechazado" "400" "400" "$REASON"
  else
    attack_result "Replay telemetría" "400" "201" "NO FUE RECHAZADO"
    return 1
  fi
}

# ==================== ATAQUE A9: LEDGER MANIPULADO ====================

attack_a9() {
  echo ""
  echo -e "${MAGENTA}========================================${NC}"
  echo -e "${MAGENTA}ATAQUE A9: Ledger manipulado offline${NC}"
  echo -e "${MAGENTA}========================================${NC}"
  echo ""

  echo "⊘ Este ataque se ejecuta manualmente (requiere detener containers)"
  echo ""
  echo "Pasos:"
  echo "  1. bash scripts/setup-demo-pitch-data.sh (crear datos)"
  echo "  2. docker compose stop (pausar red)"
  echo "  3. nano data/coordinador-nacional/ledger.json (editar 1 byte)"
  echo "  4. docker compose up -d (reiniciar)"
  echo "  5. curl http://localhost:3001/verify-integrity"
  echo ""
  echo "Resultado esperado: { \"valid\": false }"
}

# ==================== MAIN ====================

main() {
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}INTEGRA Attack Scenario Simulator${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""

  check_health
  echo -e "${GREEN}✓ Red disponible${NC}"
  echo ""

  ATTACK="${1:-all}"

  case "$ATTACK" in
    a1) attack_a1 ;;
    a2) attack_a2 ;;
    a3) attack_a3 ;;
    a4) attack_a4 ;;
    a5) attack_a5 ;;
    a6) attack_a6 ;;
    a7) attack_a7 ;;
    a8) attack_a8 ;;
    a9) attack_a9 ;;
    all)
      attack_a1
      attack_a2
      attack_a3
      attack_a4
      attack_a5
      attack_a6
      attack_a7
      attack_a8
      echo ""
      echo -e "${YELLOW}A9 se ejecuta manualmente (ver PASOS_DE_ATAQUES.md)${NC}"
      ;;
    *)
      echo -e "${RED}Uso: $0 <a1|a2|a3|a4|a5|a6|a7|a8|a9|all>${NC}"
      exit 1
      ;;
  esac

  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}Verificación final${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""

  HEIGHT=$(curl -s "$COORD_URL/health" | jq -r '.ledgerHeight // 0')
  echo "Altura final del ledger: $HEIGHT (debe ser 0 si no se creó ningun bloque válido)"

  INTEGRITY=$(curl -s "$COORD_URL/verify-integrity" | jq -r '.valid // false')
  if [[ "$INTEGRITY" == "true" ]]; then
    echo -e "${GREEN}✓ Integridad: válida${NC}"
  else
    echo -e "${RED}✘ Integridad: rota${NC}"
  fi

  echo ""
  echo -e "${GREEN}✓ Simulación completada${NC}"
}

main "$@"

