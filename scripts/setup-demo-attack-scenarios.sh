#!/usr/bin/env bash
# Escenarios de ataque INTEGRA — cada uno DEBE ser rechazado y no escribir bloques.
#
# Los nodos hablan HTTP (no mTLS). curl --cert no se usa: la identidad la
# define el campo signatures[].actor y se verifica contra certs/<actor>/cert.pem.
#
# Uso (raíz del repo, red arriba):
#   bash scripts/setup-demo-attack-scenarios.sh a1
#   bash scripts/setup-demo-attack-scenarios.sh all

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

COORD_URL="http://localhost:3001"
DONANTE_URL="http://localhost:3003"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
IOT_KEY="$REPO_ROOT/certs/iot/devices/sensor-contenedor-001/key.pem"

height() {
  curl -s "$COORD_URL/health" | jq -r '.ledgerHeight // 0'
}

expect_rejected() {
  local label="$1"
  local json="$2"
  local ok
  ok="$(echo "$json" | jq -r '.ok // empty')"
  if [[ "$ok" == "true" ]]; then
    echo -e "${RED}✘ FALLA (security breach): ${label} fue ACEPTADO${NC}"
    echo "$json" | jq . 2>/dev/null || echo "$json"
    return 1
  fi
  echo -e "${GREEN}✓ ESPERADO: ${label} rechazado${NC}"
  echo "$json" | jq -c '{ok,reason,details}' 2>/dev/null || echo "$json"
  return 0
}

sign_iot() {
  local payload="$1"
  node -e '
    const crypto = require("crypto");
    const fs = require("fs");
    const payload = JSON.parse(process.argv[1]);
    const keyPath = process.argv[2];
    function sortKeysDeep(value) {
      if (Array.isArray(value)) return value.map(sortKeysDeep);
      if (value && typeof value === "object") {
        return Object.keys(value).sort().reduce((acc, k) => {
          acc[k] = sortKeysDeep(value[k]);
          return acc;
        }, {});
      }
      return value;
    }
    const data = JSON.stringify(sortKeysDeep(payload));
    const sig = crypto.sign("sha256", Buffer.from(data), fs.readFileSync(keyPath)).toString("base64");
    process.stdout.write(sig);
  ' "$payload" "$IOT_KEY"
}

stale_iso() {
  if date -u -d "40 minutes ago" +"%Y-%m-%dT%H:%M:%SZ" >/dev/null 2>&1; then
    date -u -d "40 minutes ago" +"%Y-%m-%dT%H:%M:%SZ"
  else
    date -u -v-40M +"%Y-%m-%dT%H:%M:%SZ"
  fi
}

attack_a1() {
  echo -e "${YELLOW}A1 — Spoofing: firma basura (el nodo verifica contra el cert de CA en disco)${NC}"
  local payload='{"donorId":"fake-001","bloodType":"O+","hlaProfile":{"A":"A1","B":"B1","DR":"DR1"},"organType":"kidney","preservationMethod":"static-cold"}'
  local json
  json=$(curl -s -X POST "$DONANTE_URL/tx/donor-registry" \
    -H "Content-Type: application/json" \
    -d "{\"payload\":$payload,\"signatures\":[{\"actor\":\"hospital-donante\",\"signature\":\"AAAA\"}]}")
  expect_rejected "A1 firma falsa" "$json"
}

attack_a2() {
  echo -e "${YELLOW}A2 — Spoofing: firma de coordinador presentada como hospital-donante${NC}"
  local payload='{"donorId":"spoofed-001","bloodType":"O+","hlaProfile":{"A":"A1","B":"B1","DR":"DR1"},"organType":"kidney","preservationMethod":"static-cold"}'
  local sig
  sig=$(curl -s -X POST "$COORD_URL/sign" -H "Content-Type: application/json" \
    -d "{\"payload\":$payload}" | jq -r '.signature // empty')
  local json
  json=$(curl -s -X POST "$DONANTE_URL/tx/donor-registry" \
    -H "Content-Type: application/json" \
    -d "{\"payload\":$payload,\"signatures\":[{\"actor\":\"hospital-donante\",\"signature\":\"$sig\"}]}")
  expect_rejected "A2 mismatch de identidad" "$json"
}

attack_a3() {
  echo -e "${YELLOW}A3 — Tampering: un byte de una firma válida${NC}"
  local payload='{"donorId":"tamper-001","bloodType":"A-","hlaProfile":{"A":"A1","B":"B1","DR":"DR1"},"organType":"kidney","preservationMethod":"static-cold"}'
  local sig
  sig=$(curl -s -X POST "$DONANTE_URL/sign" -H "Content-Type: application/json" \
    -d "{\"payload\":$payload}" | jq -r '.signature // empty')
  local tampered="${sig:0:1}X${sig:2}"
  local json
  json=$(curl -s -X POST "$DONANTE_URL/tx/donor-registry" \
    -H "Content-Type: application/json" \
    -d "{\"payload\":$payload,\"signatures\":[{\"actor\":\"hospital-donante\",\"signature\":\"$tampered\"}]}")
  expect_rejected "A3 firma alterada" "$json"
}

attack_a4() {
  echo -e "${YELLOW}A4 — Endorsement: waiting-list con 1 firma${NC}"
  local payload='{"patientId":"wl-one-sig-001","bloodType":"O+","hlaProfile":{"A":"A1","B":"B5","DR":"DR1"},"urgencyLevel":2}'
  local sig
  sig=$(curl -s -X POST "$COORD_URL/sign" -H "Content-Type: application/json" \
    -d "{\"payload\":$payload}" | jq -r '.signature // empty')
  local json
  json=$(curl -s -X POST "$COORD_URL/tx/waiting-list" \
    -H "Content-Type: application/json" \
    -d "{\"payload\":$payload,\"signatures\":[{\"actor\":\"coordinador-nacional\",\"signature\":\"$sig\"}]}")
  expect_rejected "A4 una sola firma" "$json"
}

attack_a5() {
  echo -e "${YELLOW}A5 — Endorsement: assignment sin hospital-donante${NC}"
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local payload
  payload="{\"donorId\":\"donor-attack-001\",\"recipientId\":\"patient-attack-001\",\"organ\":\"kidney\",\"compatibilityTimestamp\":\"$ts\"}"
  local sig
  sig=$(curl -s -X POST "$COORD_URL/sign" -H "Content-Type: application/json" \
    -d "{\"payload\":$payload}" | jq -r '.signature // empty')
  local json
  json=$(curl -s -X POST "$COORD_URL/tx/assignment" \
    -H "Content-Type: application/json" \
    -d "{\"payload\":$payload,\"signatures\":[{\"actor\":\"coordinador-nacional\",\"signature\":\"$sig\"}]}")
  expect_rejected "A5 assignment incompleto" "$json"
}

attack_a6() {
  echo -e "${YELLOW}A6 — Lectura sin x-actor (RBAC; CORS no corta curl)${NC}"
  local json
  json=$(curl -s -H "Origin: https://evil.com" "$COORD_URL/dashboard/casos/demo-donor-001")
  expect_rejected "A6 sin actor" "$json"
}

attack_a7() {
  echo -e "${YELLOW}A7 — IoT intenta waiting-list (firma real del device)${NC}"
  if [[ ! -f "$IOT_KEY" ]]; then
    echo -e "${RED}No está $IOT_KEY — ¿corriste ca-setup?${NC}"
    return 1
  fi
  local payload='{"patientId":"iot-attack-patient","bloodType":"AB-","hlaProfile":{"A":"A1","B":"B1","DR":"DR1"},"urgencyLevel":5}'
  local sig
  sig=$(sign_iot "$payload")
  local json
  json=$(curl -s -X POST "$DONANTE_URL/tx/waiting-list" \
    -H "Content-Type: application/json" \
    -d "{\"payload\":$payload,\"signatures\":[{\"actor\":\"iot:sensor-contenedor-001\",\"signature\":\"$sig\"}]}")
  expect_rejected "A7 IoT fuera de política" "$json"
}

attack_a8() {
  echo -e "${YELLOW}A8 — Replay: compatibilityTimestamp de hace 40 min${NC}"
  local ts
  ts=$(stale_iso)
  local payload
  payload="{\"donorId\":\"replay-donor-001\",\"recipientId\":\"replay-patient-001\",\"organ\":\"kidney\",\"compatibilityTimestamp\":\"$ts\"}"
  local cs hs
  cs=$(curl -s -X POST "$COORD_URL/sign" -H "Content-Type: application/json" -d "{\"payload\":$payload}" | jq -r '.signature')
  hs=$(curl -s -X POST "$DONANTE_URL/sign" -H "Content-Type: application/json" -d "{\"payload\":$payload}" | jq -r '.signature')
  local json
  json=$(curl -s -X POST "$DONANTE_URL/tx/assignment" \
    -H "Content-Type: application/json" \
    -d "{\"payload\":$payload,\"signatures\":[{\"actor\":\"coordinador-nacional\",\"signature\":\"$cs\"},{\"actor\":\"hospital-donante\",\"signature\":\"$hs\"}]}")
  expect_rejected "A8 timestamp expirado" "$json"
}

TARGET="${1:-all}"

if [[ "$TARGET" == "-h" || "$TARGET" == "--help" ]]; then
  echo "Uso: $0 [a1|a2|a3|a4|a5|a6|a7|a8|all]"
  echo "A9 (tampering de ledger.json) es manual: ver PASOS_DE_ATAQUES.md"
  exit 0
fi

if ! curl -s "$COORD_URL/health" >/dev/null; then
  echo -e "${RED}No hay red en $COORD_URL. Primero: docker compose up -d${NC}"
  exit 1
fi

BEFORE=$(height)
echo -e "${BLUE}Altura inicial: $BEFORE${NC}"

failed=0
run_target() {
  case "$1" in
    a1|A1) attack_a1 ;;
    a2|A2) attack_a2 ;;
    a3|A3) attack_a3 ;;
    a4|A4) attack_a4 ;;
    a5|A5) attack_a5 ;;
    a6|A6) attack_a6 ;;
    a7|A7) attack_a7 ;;
    a8|A8) attack_a8 ;;
    *)
      echo "Uso: $0 [a1|a2|a3|a4|a5|a6|a7|a8|all]"
      echo "A9 (tampering de ledger.json) es manual: ver PASOS_DE_ATAQUES.md"
      return 2
      ;;
  esac
}

if [[ "$TARGET" == "all" ]]; then
  for id in a1 a2 a3 a4 a5 a6 a7 a8; do
    echo ""
    if ! "attack_${id}"; then
      failed=$((failed + 1))
    fi
  done
else
  echo ""
  if ! run_target "$TARGET"; then
    failed=1
  fi
fi

AFTER=$(height)
echo ""
echo -e "${BLUE}Altura final: $AFTER (debe ser igual a $BEFORE)${NC}"
if [[ "$AFTER" != "$BEFORE" ]]; then
  echo -e "${RED}✘ El ledger creció: algún ataque escribió un bloque${NC}"
  exit 1
fi

if [[ "$failed" -gt 0 ]]; then
  echo -e "${RED}✘ $failed ataque(s) no se comportaron como se esperaba${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}✓ Ataques rechazados. El ledger no cambió.${NC}"
echo "Integridad: curl -s $COORD_URL/verify-integrity | jq"
echo "Suite en UI: http://localhost:3000/infra → Ejecutar verificación"
