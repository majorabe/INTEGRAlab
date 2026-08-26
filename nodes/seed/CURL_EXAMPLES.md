# INTEGRA HLA Compatibility & Assignment Workflow

Este documento describe cómo usar los endpoints de compatibilidad HLA y asignación de órganos en INTEGRA, incluyendo ejemplos de curl y escenarios de seguridad.

## Endpoints

### 1. Consulta de Compatibilidad HLA

**Endpoint**: `POST /compatibility/query`

**Descripción**: Motor de compatibilidad de solo lectura que calcula el ranking de candidatos en la lista de espera respecto a un donante.

**Request**:
```bash
curl -X POST http://localhost:3003/compatibility/query \
  -H "Content-Type: application/json" \
  -d '{
    "donorProfile": {
      "bloodType": "O+",
      "hlaProfile": {
        "A": "A2",
        "B": "B7",
        "DR": "DR5"
      }
    },
    "waitingList": [
      {
        "patientId": "patient-001",
        "bloodType": "O+",
        "hlaProfile": {
          "A": "A2",
          "B": "B7",
          "DR": "DR4"
        },
        "urgencyLevel": 3
      }
    ]
  }'
```

**Response**:
```json
{
  "ok": true,
  "compatibilityTimestamp": "2026-08-26T14:55:30.123Z",
  "rankedCandidates": [
    {
      "patientId": "patient-001",
      "bloodType": "O+",
      "hlaProfile": {
        "A": "A2",
        "B": "B7",
        "DR": "DR4"
      },
      "urgencyLevel": 3,
      "hlaScore": 66.67
    }
  ]
}
```

**Criterios de Ranking**:
1. **Compatibilidad de Grupo Sanguíneo** (filtro): O+ es universal (compatible con todos); AB+ acepta de todos
2. **HLA Score** (mayor primero): (matches / 3 loci) * 100
   - 3 matches = 100
   - 2 matches = 66.67
   - 1 match = 33.33
   - 0 matches = 0
3. **Urgency Level** (desempate): candidatos con igual score HLA se ordenan por urgency descendente

**Notas**:
- No requiere firma criptográfica (es solo lectura, no modifica el ledger)
- Devuelve `compatibilityTimestamp` con ISO 8601 timestamp del servidor
- El cliente **debe** incluir este timestamp en la transacción de asignación posterior

---

### 2. Transacción de Asignación

**Endpoint**: `POST /tx/assignment`

**Descripción**: Emite una transacción de asignación que conecta un donante con un receptor elegido. Requiere:
- Firma del coordinador-nacional
- Firma del hospital-donante
- `compatibilityTimestamp` en el payload (de /compatibility/query)
- Timestamp no más antiguo que 30 minutos

**Cálculo de Firmas**:

Primero, obtén las firmas de cada actor sobre el payload de asignación:

```bash
# Obtener firma del coordinador-nacional
curl -X POST http://localhost:3001/sign \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "donorId": "donor-001",
      "recipientId": "patient-001",
      "organ": "kidney",
      "compatibilityTimestamp": "2026-08-26T14:55:30.123Z"
    }
  }'

# Respuesta:
# {
#   "ok": true,
#   "actor": "coordinador-nacional",
#   "signature": "base64_encoded_signature_here"
# }
```

```bash
# Obtener firma del hospital-donante
curl -X POST http://localhost:3003/sign \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "donorId": "donor-001",
      "recipientId": "patient-001",
      "organ": "kidney",
      "compatibilityTimestamp": "2026-08-26T14:55:30.123Z"
    }
  }'
```

**Enviar la Transacción**:

```bash
curl -X POST http://localhost:3003/tx/assignment \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "donorId": "donor-001",
      "recipientId": "patient-001",
      "organ": "kidney",
      "compatibilityTimestamp": "2026-08-26T14:55:30.123Z"
    },
    "signatures": [
      {
        "actor": "coordinador-nacional",
        "signature": "signature_from_coordinador_nacional"
      },
      {
        "actor": "hospital-donante",
        "signature": "signature_from_hospital_donante"
      }
    ]
  }'
```

**Response (éxito)**:
```json
{
  "ok": true,
  "block": {
    "index": 42,
    "timestamp": "2026-08-26T14:55:35.456Z",
    "txType": "assignment",
    "payload": {
      "donorId": "donor-001",
      "recipientId": "patient-001",
      "organ": "kidney",
      "compatibilityTimestamp": "2026-08-26T14:55:30.123Z"
    },
    "signatures": [...],
    "hash": "sha256_hash_here",
    "previousHash": "hash_of_previous_block"
  },
  "replication": [
    {"peer": "http://coordinador-nacional:3000", "ok": true},
    {"peer": "http://coordinador-provincial:3000", "ok": true},
    {"peer": "http://hospital-receptor:3000", "ok": true}
  ]
}
```

---

## Prevención de Replay Attacks

La política de endorsement para "assignment" valida que:

1. **El payload incluya `compatibilityTimestamp`**
   ```
   Razón de error: "AssignmentContract requiere compatibilityTimestamp en el payload"
   ```

2. **El timestamp no sea más antiguo que 30 minutos**
   ```
   Razón de error: "compatibilityTimestamp expirado (antigüedad: 31 min, máximo: 30 min)"
   ```

3. **El timestamp no sea del futuro** (reloj desincronizado)
   ```
   Razón de error: "compatibilityTimestamp es del futuro (reloj del cliente desincronizado?)"
   ```

### Ejemplo: Ataque de Replay Bloqueado

Si intentas usar un timestamp de hace 31 minutos:

```bash
# Calcular timestamp de hace 31 minutos:
STALE_TIMESTAMP=$(node -e "console.log(new Date(Date.now() - 31*60*1000).toISOString())")

curl -X POST http://localhost:3003/tx/assignment \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "donorId": "donor-001",
      "recipientId": "patient-002",
      "organ": "kidney",
      "compatibilityTimestamp": "'$STALE_TIMESTAMP'"
    },
    "signatures": [...]
  }'
```

**Response (rechazado)**:
```json
{
  "ok": false,
  "reason": "compatibilityTimestamp expirado (antigüedad: 31 min, máximo: 30 min)"
}
```

---

## Flujo Completo (Step-by-Step)

1. **Cliente consulta compatibilidad**:
   ```bash
   POST /compatibility/query → obtiene compatibilityTimestamp + candidatos ranqueados
   ```

2. **Cliente elige el mejor candidato** (de acuerdo al ranking devuelto)

3. **Cliente construye payload de asignación** (incluyendo compatibilityTimestamp)

4. **Cliente obtiene firmas**:
   ```bash
   POST /sign (coordinador-nacional) → firma
   POST /sign (hospital-donante) → firma
   ```

5. **Cliente emite transacción**:
   ```bash
   POST /tx/assignment → transacción grabada en ledger (si valida)
   ```

6. **Replicación automática**: Los nodos pares reciben y validan independientemente

---

## Script de Demo

Ver `curl-examples.sh` para un script interactivo que demuestra:
- Consulta de compatibilidad exitosa
- Asignación exitosa con timestamp válido
- Bloqueo de ataque de replay con timestamp expirado

```bash
bash nodes/seed/curl-examples.sh
```

---

## Seguridad y Validación

| Aspecto | Validación |
|--------|-----------|
| **Firmas criptográficas** | RSA-SHA256, verificadas contra certificados X.509 |
| **Cadena de confianza** | Validadas contra Root CA de INTEGRA |
| **Timestamp de compatibilidad** | Máximo 30 minutos de antigüedad |
| **Endorsement** | Requiere coordinador-nacional + hospital-donante |
| **Integridad del ledger** | Cadena de hashes (SHA-256) verificada en cada replicación |

---

## Datos de Ejemplo

### Candidatos en Espera (`waiting-list-ejemplo.json`)

```json
[
  {
    "patientId": "patient-001",
    "bloodType": "O+",
    "hlaProfile": {"A": "A2", "B": "B7", "DR": "DR4"},
    "urgencyLevel": 3
  },
  {
    "patientId": "patient-002",
    "bloodType": "A+",
    "hlaProfile": {"A": "A2", "B": "B8", "DR": "DR3"},
    "urgencyLevel": 5
  },
  {
    "patientId": "patient-003",
    "bloodType": "B+",
    "hlaProfile": {"A": "A1", "B": "B7", "DR": "DR4"},
    "urgencyLevel": 2
  },
  {
    "patientId": "patient-004",
    "bloodType": "AB+",
    "hlaProfile": {"A": "A3", "B": "B44", "DR": "DR13"},
    "urgencyLevel": 4
  }
]
```

### Donante de Ejemplo

```json
{
  "donorId": "donor-001",
  "bloodType": "O+",
  "hlaProfile": {"A": "A2", "B": "B7", "DR": "DR5"}
}
```

---

## Requisitos

- Docker & Docker Compose v2.20+
- INTEGRA stack corriendo: `docker compose up --build`
- `jq` instalado (para parsear JSON en los ejemplos)
- `curl` (para hacer requests HTTP)

Ejecutar desde la raíz del repositorio INTEGRAlab.
