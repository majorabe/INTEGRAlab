# PASOS DE ATAQUES — INTEGRAlab

**Escenarios de seguridad: qué rechaza el sistema y por qué.**

Desde la **raíz del repo** (`INTEGRAlab/`).

---

## Objetivo

Demostrar que la red **detecta y rechaza** intentos comunes de ataque:
- **Spoofing** de identidad (cert falso, cert de otra org)
- **Tampering** con firmas y endorsement
- **Replay** de transacciones y telemetría
- **Falta de quorum** (demasiados nodos caídos)
- **Control de acceso** (IoT escribiendo en tipos de tx que no le corresponden)
- **Fallos de integridad** (manipulación offline del ledger)

---

## Precondiciones

Este flujo de ataques asume:

1. **Red levantada** sin casos de demostración:
   ```bash
   ./scripts/reset.sh --force
   docker compose up --build -d
   curl -s http://localhost:3001/health | jq '{ledgerHeight}'
   # Debe mostrar: { "ledgerHeight": 0 }
   ```

2. **Sin IoT corriendo**. Si está arriba:
   ```bash
   docker compose stop iot-simulator
   ```

3. **Dashboard disponible** en `http://localhost:3000`.

---

## Estructura de ataques

| # | Ataque | Tipo | Endpoint | Esperado |
|---|--------|------|----------|----------|
| **A1** | Cert autofirmado (no de CA) | Spoofing | `/tx/donor-registry` | 401 Unauthorized |
| **A2** | Cert de otra org | Spoofing | `/tx/waiting-list` | 401 Unauthorized |
| **A3** | Firma inválida/modificada | Tampering | `/tx/donor-registry` | 401 Unauthorized |
| **A4** | WaitingList con 1 firma (necesita 2) | Endorsement | `/tx/waiting-list` | 403 Forbidden |
| **A5** | Assignment sin firma de hospital | Endorsement | `/tx/assignment` | 403 Forbidden |
| **A6** | Lectura no autorizada | RBAC | `GET /dashboard/casos/{id}` | 403 Forbidden |
| **A7** | IoT escribe en waiting-list | RBAC | `/tx/waiting-list` (con cert IoT) | 403 Forbidden |
| **A8** | Replay de telemetría (nonce expirado) | Replay | `/tx/custody` | 400 Bad Request |
| **A9** | Alterar ledger offline | Integridad | `/verify-integrity` | `{ "valid": false }` |

---

## PASO 0 — Verificar precondiciones

### Comando

```bash
# Comprobar que red está limpia
curl -s http://localhost:3001/health | jq '{org,ledgerHeight,status}'

# Debe devolver:
# {
#   "org": "coordinador-nacional",
#   "ledgerHeight": 0,
#   "status": "ok"
# }
```

### Qué esperar

Red en estado inicial: 0 bloques, 4 nodos activos, sin datos previos.

---

## ATAQUE A1 — Spoofing: Cert autofirmado

**Tipo:** STRIDE Spoofing
**Impacto:** Alguien intenta registrar un donante fingiendo ser `hospital-donante`, pero con cert falso
**Defensa:** Validación X.509 contra CA INTEGRA

### Comando

```bash
bash scripts/setup-demo-attack-scenarios.sh a1
```

O manual (pseudocódigo):

```bash
# Generar cert autofirmado (no emitido por CA INTEGRA)
openssl req -x509 -newkey rsa:2048 -keyout fake.key -out fake.crt \
  -days 1 -nodes -subj "/CN=hospital-donante"

# Intentar enviar transacción
curl -s -X POST http://localhost:3003/tx/donor-registry \
  --cert fake.crt --key fake.key \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {"donorId":"fake-001","bloodType":"O+"},
    "signatures": [{"actor":"hospital-donante","signature":"fake"}]
  }'
```

### Qué esperar

```json
{
  "ok": false,
  "reason": "Firma inválida: certificado no verificable contra CA INTEGRA",
  "status": 401
}
```

**Indicador:** ✘ RECHAZADO
**Razón:** El cert no proviene de la CA de INTEGRA → no puede verificarse
**Altura ledger:** Sigue en 0 (bloque NO creado)

---

## ATAQUE A2 — Spoofing: Cert de otra organización

**Tipo:** STRIDE Spoofing
**Impacto:** Alguien usa cert válido de `coordinador-nacional` para firmar como `hospital-donante`
**Defensa:** Validación de identidad según OU del certificado

### Comando

```bash
bash scripts/setup-demo-attack-scenarios.sh a2
```

O manual:

```bash
# Usar cert real de coordinador-nacional, pero afirmar que es hospital-donante
COORD_CERT="./certs/coordinador-nacional/signcert.pem"
COORD_KEY="./certs/coordinador-nacional/signkey.pem"

# Firmar con cert de COORD, pero decir que actor="hospital-donante"
curl -s -X POST http://localhost:3003/tx/donor-registry \
  --cert "$COORD_CERT" --key "$COORD_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {"donorId":"spoofed-001","bloodType":"O+"},
    "signatures": [
      {
        "actor": "hospital-donante",
        "signature": "<firma_realizada_con_cert_de_coordinador>"
      }
    ]
  }'
```

### Qué esperar

```json
{
  "ok": false,
  "reason": "Firma de coordinador-nacional no corresponde a actor hospital-donante",
  "status": 401
}
```

**Indicador:** ✘ RECHAZADO
**Razón:** Certificado válido pero no pertenece a la identidad que reclama (mismatch OU)
**Altura ledger:** Sigue en 0

---

## ATAQUE A3 — Tampering: Firma modificada

**Tipo:** STRIDE Tampering
**Impacto:** Alguien modifica 1 byte de una firma válida
**Defensa:** Verificación criptográfica de firma

### Comando

```bash
bash scripts/setup-demo-attack-scenarios.sh a3
```

O manual:

```bash
# Obtener una firma válida
HOSP_CERT="./certs/hospital-donante/signcert.pem"
HOSP_KEY="./certs/hospital-donante/signkey.pem"

PAYLOAD='{"donorId":"test-tamper-001","bloodType":"A-"}'

SIG=$(curl -s -X POST http://localhost:3003/sign \
  -H "Content-Type: application/json" \
  --cert "$HOSP_CERT" --key "$HOSP_KEY" \
  -d "{\"payload\":$PAYLOAD}" | jq -r '.signature')

# Modificar 1 carácter de la firma (cambiar primer hex digit)
TAMPERED_SIG="${SIG:0:1}X${SIG:2}"

# Intentar enviar con firma modificada
curl -s -X POST http://localhost:3003/tx/donor-registry \
  --cert "$HOSP_CERT" --key "$HOSP_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\":$PAYLOAD,
    \"signatures\":[{\"actor\":\"hospital-donante\",\"signature\":\"$TAMPERED_SIG\"}]
  }"
```

### Qué esperar

```json
{
  "ok": false,
  "reason": "Firma inválida: no corresponde al payload",
  "status": 401
}
```

**Indicador:** ✘ RECHAZADO
**Razón:** Hash criptográfico no coincide (1 byte cambiado invalida toda la firma)
**Altura ledger:** Sigue en 0

---

## ATAQUE A4 — Endorsement incompleto: WaitingList con 1 firma

**Tipo:** STRIDE Elevation of Privilege
**Impacto:** Coordinador intenta crear lista de espera sin segundo endorsement
**Defensa:** Política N-of-M (requiere ≥2 firmas)

### Comando

```bash
bash scripts/setup-demo-attack-scenarios.sh a4
```

O manual:

```bash
PAYLOAD='{
  "patientId":"test-patient-001",
  "bloodType":"O+",
  "hlaProfile":{"A":"A1","B":"B5","DR":"DR1"},
  "urgencyLevel":2
}'

COORD_CERT="./certs/coordinador-nacional/signcert.pem"
COORD_KEY="./certs/coordinador-nacional/signkey.pem"

# Obtener solo firma del coordinador
COORD_SIG=$(curl -s -X POST http://localhost:3001/sign \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$PAYLOAD}" | jq -r '.signature')

# Intentar crear waiting-list con SOLO 1 firma
curl -s -X POST http://localhost:3001/tx/waiting-list \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\":$PAYLOAD,
    \"signatures\":[
      {\"actor\":\"coordinador-nacional\",\"signature\":\"$COORD_SIG\"}
    ]
  }"
```

### Qué esperar

```json
{
  "ok": false,
  "reason": "WaitingListManager requiere firma de coordinador-nacional + al menos 1 organización adicional",
  "status": 403
}
```

**Indicador:** ✘ RECHAZADO
**Razón:** Política requiere ≥2 orgs distintas; solo hay 1 firma
**Altura ledger:** Sigue en 0

---

## ATAQUE A5 — Endorsement incompleto: Assignment sin hospital

**Tipo:** STRIDE Elevation of Privilege
**Impacto:** Coordinador intenta asignar órgano sin validación de hospital-donante
**Defensa:** Política de 2 firmas (coordinador + hospital)

### Comando

```bash
bash scripts/setup-demo-attack-scenarios.sh a5
```

O manual:

```bash
# Primero crear una base válida: donante + paciente
# (aquí se omiten los pasos; se asume registro previo)

PAYLOAD='{
  "donorId":"donor-attack-001",
  "recipientId":"patient-attack-001",
  "organ":"kidney",
  "compatibilityTimestamp":"2026-09-02T15:30:00Z"
}'

COORD_CERT="./certs/coordinador-nacional/signcert.pem"
COORD_KEY="./certs/coordinador-nacional/signkey.pem"

COORD_SIG=$(curl -s -X POST http://localhost:3001/sign \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$PAYLOAD}" | jq -r '.signature')

# Intentar assignment con SOLO firma de coordinador
curl -s -X POST http://localhost:3001/tx/assignment \
  --cert "$COORD_CERT" --key "$COORD_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\":$PAYLOAD,
    \"signatures\":[
      {\"actor\":\"coordinador-nacional\",\"signature\":\"$COORD_SIG\"}
    ]
  }"
```

### Qué esperar

```json
{
  "ok": false,
  "reason": "AssignmentContract requiere firma de coordinador-nacional + endorsement de hospital-donante",
  "status": 403
}
```

**Indicador:** ✘ RECHAZADO
**Razón:** Assignment requiere 2 orgs específicas; solo hay 1
**Altura ledger:** Sigue en 0

---

## ATAQUE A6 — Lectura no autorizada del dashboard

**Tipo:** STRIDE Information Disclosure
**Impacto:** Usuario sin credenciales intenta leer datos clínicos
**Defensa:** Validación de origen (CORS restringido)

### Comando

```bash
bash scripts/setup-demo-attack-scenarios.sh a6
```

O manual:

```bash
# Desde origen no autorizado (ej. https://evil.com)
curl -s -X GET http://localhost:3001/dashboard/casos/donor-001 \
  -H "Origin: https://evil.com" \
  -H "Content-Type: application/json"

# Sin header Origin (navegador lo envía automáticamente)
# Pero una herramienta como curl lo puede omitir → sin CORS
```

### Qué esperar

Sin header `Access-Control-Allow-Origin`, el navegador rechaza la respuesta.
Desde curl: respuesta llega pero sin CORS headers.

**Indicador:** ⚠ BLOQUEADO (CORS)
**Razón:** Origen no autorizado (solo localhost:3000)
**Altura ledger:** N/A (es lectura, no escribe)

---

## ATAQUE A7 — IoT intenta escribir en WaitingList

**Tipo:** STRIDE Elevation of Privilege
**Impacto:** Dispositivo IoT (actor: `iot:sensor-001`) intenta crear lista de espera
**Defensa:** Política de endorsement restringida por actor

### Comando

```bash
bash scripts/setup-demo-attack-scenarios.sh a7
```

O manual:

```bash
# Cargar cert/key del IoT device
IOT_CERT="./certs/iot/devices/sensor-contenedor-001/cert.pem"
IOT_KEY="./certs/iot/devices/sensor-contenedor-001/key.pem"

PAYLOAD='{
  "patientId":"iot-attack-patient",
  "bloodType":"AB-",
  "hlaProfile":{"A":"A1","B":"B1","DR":"DR1"},
  "urgencyLevel":5
}'

IOT_SIG=$(curl -s -X POST http://localhost:3003/sign \
  -H "Content-Type: application/json" \
  --cert "$IOT_CERT" --key "$IOT_KEY" \
  -d "{\"payload\":$PAYLOAD}" | jq -r '.signature')

# Intentar crear waiting-list como IoT
curl -s -X POST http://localhost:3003/tx/waiting-list \
  --cert "$IOT_CERT" --key "$IOT_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\":$PAYLOAD,
    \"signatures\":[
      {\"actor\":\"iot:sensor-contenedor-001\",\"signature\":\"$IOT_SIG\"}
    ]
  }"
```

### Qué esperar

```json
{
  "ok": false,
  "reason": "WaitingListManager requiere firma de coordinador-nacional + al menos 1 organización adicional",
  "status": 403
}
```

**Indicador:** ✘ RECHAZADO
**Razón:** IoT no está en la política de WaitingList (solo organizaciones + coordinador)
**Altura ledger:** Sigue en 0

---

## ATAQUE A8 — Replay de telemetría (nonce expirado)

**Tipo:** STRIDE Tampering / Replay
**Impacto:** Alguien reutiliza una lectura IoT antigua (> 5 minutos)
**Defensa:** Validación de nonce fresco

### Comando

```bash
bash scripts/setup-demo-attack-scenarios.sh a8
```

O manual:

```bash
IOT_CERT="./certs/iot/devices/sensor-contenedor-001/cert.pem"
IOT_KEY="./certs/iot/devices/sensor-contenedor-001/key.pem"

# Crear nonce hace 10 minutos (expirado, umbral es 5 min)
STALE_NONCE=$(date -u -d "10 minutes ago" +"%Y-%m-%dT%H:%M:%SZ")

TELEMETRY='{
  "deviceId":"sensor-contenedor-001",
  "timestamp":"'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'",
  "nonce":"'"$STALE_NONCE"'",
  "sensorType":"temperature",
  "value":4.2,
  "unit":"celsius",
  "organId":"donor-test-replay-001"
}'

# Intentar enviar telemetría con nonce expirado
curl -s -X POST http://localhost:3003/tx/custody \
  --cert "$IOT_CERT" --key "$IOT_KEY" \
  -H "Content-Type: application/json" \
  -d "$TELEMETRY"
```

### Qué esperar

```json
{
  "ok": false,
  "reason": "Nonce expirado (antigüedad: 10 min, máximo: 5 min)",
  "status": 400
}
```

**Indicador:** ✘ RECHAZADO
**Razón:** Timestamp demasiado antiguo → protege contra replay de datos viejos
**Altura ledger:** Sigue en 0

---

## ATAQUE A9 — Manipulación offline del ledger

**Tipo:** STRIDE Tampering
**Impacto:** Alguien modifica a mano un archivo `ledger.json` offline
**Defensa:** Cadena de hashes (hash-chain)

### Procedimiento

Este ataque solo se puede hacer manualmente (no se automatiza en el script):

1. **Crear un caso legítimo**:
   ```bash
   bash scripts/setup-demo-pitch-data.sh
   ```
   Esto genera 3 bloques válidos en `/data/coordinador-nacional/ledger.json`.

2. **Parar la red**:
   ```bash
   docker compose stop
   ```

3. **Editar el ledger**:
   ```bash
   # Hacer backup
   cp data/coordinador-nacional/ledger.json data/coordinador-nacional/ledger.json.backup

   # Abrir en editor y cambiar 1 byte (ej. cambiar "kidney" a "kiduey")
   nano data/coordinador-nacional/ledger.json
   ```

4. **Reiniciar y verificar**:
   ```bash
   docker compose up -d
   curl -s http://localhost:3001/verify-integrity | jq
   ```

### Qué esperar

```json
{
  "valid": false,
  "length": 3,
  "reason": "Hash mismatch en bloque 1: esperado abc123..., encontrado xyz789..."
}
```

**Indicador:** ✘ INTEGRIDAD ROTA
**Razón:** Cambio de 1 byte invalida el hash de ese bloque, que invalida el siguiente, etc.
**Altura ledger:** N/A (la manipulación ya fue detectada)

---

## PASO 10 — Resumen de defenses

| Defensa | Implementación | Test |
|---------|----------------|------|
| **PKI X.509** | CA INTEGRA emite certs únicos por org | A1, A2 |
| **Validación de firma** | Verificación criptográfica RSA | A3 |
| **Endorsement N-of-M** | Políticas definidas por tipo de tx | A4, A5, A7 |
| **Nonce fresco** | Validación de timestamp (5 min) | A8 |
| **Cadena de hashes** | Hash chain (cada bloque incluye hash anterior) | A9 |
| **CORS restringido** | Solo localhost:3000 | A6 |
| **Validación de actor** | OU del cert vs. actor en tx | A2 |

---

## PASO 11 — Script automatizado

Para ejecutar todos los ataques de una vez:

```bash
bash scripts/setup-demo-attack-scenarios.sh all
```

Muestra:
- ✓ ESPERADO: Rechazado (green)
- ✘ FALLA: No fue rechazado (red — security breach)
- Altura final del ledger (debe seguir en 0)
- Integridad final

---

## Checklist

| Paso | Comando | Qué esperar |
|------|---------|------------|
| 0 | `curl :3001/health` | `ledgerHeight: 0` |
| A1 | `bash setup-demo-attack-scenarios.sh a1` | ✘ Rechazado (cert falso) |
| A2 | `bash setup-demo-attack-scenarios.sh a2` | ✘ Rechazado (cert otra org) |
| A3 | `bash setup-demo-attack-scenarios.sh a3` | ✘ Rechazado (firma modificada) |
| A4 | `bash setup-demo-attack-scenarios.sh a4` | ✘ Rechazado (1 firma < 2 reqs) |
| A5 | `bash setup-demo-attack-scenarios.sh a5` | ✘ Rechazado (endorsement incompleto) |
| A6 | `bash setup-demo-attack-scenarios.sh a6` | ⚠ CORS bloqueado |
| A7 | `bash setup-demo-attack-scenarios.sh a7` | ✘ Rechazado (IoT no en política) |
| A8 | `bash setup-demo-attack-scenarios.sh a8` | ✘ Rechazado (nonce expirado) |
| A9 | Manual (pasos arriba) | `{ "valid": false }` |
| Fin | `curl :3001/verify-integrity` | `{ "valid": true, "length": 0 }` |

---

**Actualizado:** 2 de septiembre 2026

