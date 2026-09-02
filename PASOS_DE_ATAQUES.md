# PASOS DE ATAQUES — INTEGRAlab

**Escenarios de seguridad: qué rechaza el sistema y por qué.**

Desde la **raíz del repo** (`INTEGRAlab/`).

Los nodos hablan **HTTP**, no mTLS. `curl --cert` no autentica. La identidad
es el campo `signatures[].actor`: el nodo carga `certs/<actor>/cert.pem`
(emitido por la CA INTEGRA) y verifica la firma contra esa clave pública.

---

## Objetivo

Demostrar que la red **detecta y rechaza** intentos comunes de ataque:

- **Spoofing** de identidad (firma falsa, firma de otra org)
- **Tampering** de firmas y del archivo del ledger
- **Replay** de un assignment con timestamp de compatibilidad viejo
- **Falta de quorum** (se ve en `/infra` y en test19 desde el host)
- **Control de acceso** (lectura sin `x-actor`; IoT escribiendo waiting-list)
- **Fallos de integridad** (manipulación offline de `ledger.json`)

---



## Precondiciones

1. **Red levantada** (puede estar vacía o con el caso demo; los ataques no escriben):
  ```bash
   docker compose up --build -d
   curl -s http://localhost:3001/health | jq '{org,ledgerHeight,status}'
  ```
2. **Sin IoT corriendo** no es obligatorio para A1–A8 (no se escribe custody).
3. **Dashboard** en `http://localhost:3000/infra`.
4. Certificados de CA (el servicio `ca-setup` los genera al levantar compose).

---



## Estructura de ataques


| #      | Ataque                                             | Tipo        | Endpoint                    | Esperado             |
| ------ | -------------------------------------------------- | ----------- | --------------------------- | -------------------- |
| **A1** | Firma basura (no corresponde al cert de CA)        | Spoofing    | `POST /tx/donor-registry`   | 401, `ok: false`     |
| **A2** | Firma de otra org presentada como hospital-donante | Spoofing    | `POST /tx/donor-registry`   | 401, `ok: false`     |
| **A3** | Un byte de una firma válida                        | Tampering   | `POST /tx/donor-registry`   | 401, `ok: false`     |
| **A4** | Waiting-list con 1 firma (hace falta 2)            | Endorsement | `POST /tx/waiting-list`     | 403                  |
| **A5** | Assignment sin firma de hospital-donante           | Endorsement | `POST /tx/assignment`       | 403                  |
| **A6** | Lectura clínica sin `x-actor`                      | RBAC        | `GET /dashboard/casos/{id}` | 403                  |
| **A7** | IoT escribe waiting-list                           | RBAC        | `POST /tx/waiting-list`     | 403                  |
| **A8** | Assignment con `compatibilityTimestamp` > 30 min   | Replay      | `POST /tx/assignment`       | 403                  |
| **A9** | Alterar `ledger.json` offline                      | Integridad  | `GET /verify-integrity`     | `{ "valid": false }` |


---



## PASO 0 — Verificar precondiciones

```bash
curl -s http://localhost:3001/health | jq '{org,ledgerHeight,status}'
```

Ejemplo:

```json
{
  "org": "coordinador-nacional",
  "ledgerHeight": 0,
  "status": "ok"
}
```

Un ledger con bloques del caso demo también sirve: A1–A8 no deben incrementar `ledgerHeight`.

---



## ATAQUE A1 — Spoofing: firma que no verifica contra la CA

**Tipo:** STRIDE Spoofing  
**Impacto:** Registrar un donante fingiendo ser `hospital-donante`  
**Defensa:** `verifySignature` usa el certificado **en disco** de esa org (cadena hasta Root CA INTEGRA). Una firma inventada no verifica.

No hay mTLS: un certificado autofirmado en `curl --cert` **se ignora**.

### Comando

```bash
bash scripts/setup-demo-attack-scenarios.sh a1
```

O manual:

```bash
curl -s -X POST http://localhost:3003/tx/donor-registry \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "donorId":"fake-001",
      "bloodType":"O+",
      "hlaProfile":{"A":"A1","B":"B1","DR":"DR1"},
      "organType":"kidney",
      "preservationMethod":"static-cold"
    },
    "signatures": [{"actor":"hospital-donante","signature":"AAAA"}]
  }' | jq
```



### Qué esperar

```json
{
  "ok": false,
  "reason": "Firma(s) inválida(s)",
  "details": ["Firma inválida para actor \"hospital-donante\""]
}
```

HTTP **401**. El ledger no crece.

**Suite:** test02 (`test02_rechazoSpoofing`) es un rechazo equivalente (payload mal formado / sin firmas válidas).

---



## ATAQUE A2 — Spoofing: firma de otra organización

**Tipo:** STRIDE Spoofing  
**Impacto:** Firmar en el nodo del coordinador y reclamar actor `hospital-donante`  
**Defensa:** La firma se verifica con `certs/hospital-donante/cert.pem`, no con el cert que “presenta” el cliente.

Los archivos reales son `certs/<org>/cert.pem` y `key.pem` (no `signcert.pem` / `signkey.pem`). Además `/sign` **siempre** firma como `ORG_NAME` de ese nodo: en `:3001` es `coordinador-nacional`.

### Comando

```bash
bash scripts/setup-demo-attack-scenarios.sh a2
```

O manual:

```bash
PAYLOAD='{"donorId":"spoofed-001","bloodType":"O+","hlaProfile":{"A":"A1","B":"B1","DR":"DR1"},"organType":"kidney","preservationMethod":"static-cold"}'

SIG=$(curl -s -X POST http://localhost:3001/sign \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$PAYLOAD}" | jq -r '.signature')

curl -s -X POST http://localhost:3003/tx/donor-registry \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$PAYLOAD,\"signatures\":[{\"actor\":\"hospital-donante\",\"signature\":\"$SIG\"}]}" | jq
```



### Qué esperar

401, `Firma(s) inválida(s)`. La firma es válida para el coordinador, no para el hospital.

**Suite:** test04 (`test04_certOtraOrg`).

---



## ATAQUE A3 — Tampering: firma modificada

**Tipo:** STRIDE Tampering  
**Impacto:** Alterar 1 carácter de una firma RSA-SHA256 válida  
**Defensa:** `crypto.verify` falla.

### Comando

```bash
bash scripts/setup-demo-attack-scenarios.sh a3
```

O manual:

```bash
PAYLOAD='{"donorId":"tamper-001","bloodType":"A-","hlaProfile":{"A":"A1","B":"B1","DR":"DR1"},"organType":"kidney","preservationMethod":"static-cold"}'

SIG=$(curl -s -X POST http://localhost:3003/sign \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$PAYLOAD}" | jq -r '.signature')

TAMPERED="${SIG:0:1}X${SIG:2}"

curl -s -X POST http://localhost:3003/tx/donor-registry \
  -H "Content-Type: application/json" \
  -d "{\"payload\":$PAYLOAD,\"signatures\":[{\"actor\":\"hospital-donante\",\"signature\":\"$TAMPERED\"}]}" | jq
```



### Qué esperar

401, `Firma(s) inválida(s)`.

**Suite:** test06 cubre el caso “sin firma válida”. A3 está en el script (byte flip).

---



## ATAQUE A4 — Endorsement incompleto: waiting-list con 1 firma

**Tipo:** STRIDE Elevation of Privilege  
**Defensa:** política N-of-M: `coordinador-nacional` + al menos otra org.

### Comando

```bash
bash scripts/setup-demo-attack-scenarios.sh a4
```



### Qué esperar

```json
{
  "ok": false,
  "reason": "WaitingListManager requiere firma de coordinador-nacional + al menos 1 organización adicional"
}
```

HTTP **403**.

**Suite:** test08.

---



## ATAQUE A5 — Endorsement incompleto: assignment sin hospital

**Tipo:** STRIDE Elevation of Privilege  
**Defensa:** `coordinador-nacional` + `hospital-donante`. El `compatibilityTimestamp` debe ser ISO reciente (máx. 30 min); A5 usa uno fresco para que el rechazo sea por firmas, no por replay.

### Comando

```bash
bash scripts/setup-demo-attack-scenarios.sh a5
```



### Qué esperar

```json
{
  "ok": false,
  "reason": "AssignmentContract requiere firma de coordinador-nacional + endorsement de hospital-donante"
}
```

HTTP **403**.

**Suite:** test09.

---



## ATAQUE A6 — Lectura clínica sin actor

**Tipo:** STRIDE Information Disclosure  
**Defensa:** header `x-actor`. Sin él (o con un actor no autorizado) el nodo responde **403**.

CORS solo aplica al **navegador**: orígenes distintos de `http://localhost:3000` no reciben `Access-Control-Allow-Origin`. `curl` igual ve el cuerpo JSON. No es la defensa de A6.

### Comando

```bash
bash scripts/setup-demo-attack-scenarios.sh a6
```

O manual:

```bash
curl -s http://localhost:3001/dashboard/casos/demo-donor-001 \
  -H "Origin: https://evil.com" | jq
```



### Qué esperar

```json
{
  "ok": false,
  "reason": "Actor \"(sin identificar)\" no autorizado a consultar dashboard"
}
```

HTTP **403**. No escribe bloques.

**En la UI:** sin elegir organización, Consulta no llama al nodo con un actor válido.

**Suite:** test13 pega a `GET /ledger` sin `x-actor` (mismo control).

---



## ATAQUE A7 — IoT intenta waiting-list

**Tipo:** STRIDE Elevation of Privilege  
**Defensa:** la política de waiting-list no incluye actores `iot:…`.

`POST /sign` en `:3003` firma como **hospital-donante**, no como el sensor. Hay que firmar con `certs/iot/devices/sensor-contenedor-001/key.pem` (el script lo hace).

### Comando

```bash
bash scripts/setup-demo-attack-scenarios.sh a7
```



### Qué esperar

403, misma razón que A4 (el IoT no cuenta como coordinador + segunda org).

**Suite:** test14.

---



## ATAQUE A8 — Replay: timestamp de compatibilidad expirado

**Tipo:** STRIDE Tampering / Replay  
**Defensa:** `AssignmentContract` exige `compatibilityTimestamp` de no más de **30 minutos**. No hay campo `nonce` en custody: un replay de telemetría IoT no se modela así.

### Comando

```bash
bash scripts/setup-demo-attack-scenarios.sh a8
```



### Qué esperar

```json
{
  "ok": false,
  "reason": "compatibilityTimestamp expirado (antigüedad: 40 min, máximo: 30 min)"
}
```

HTTP **403**. Firmas válidas de coordinador + hospital; igual se rechaza.

**Suite:** test12.

---



## ATAQUE A9 — Manipulación offline del ledger

**Tipo:** STRIDE Tampering  
**Defensa:** hash-chain. `GET /verify-integrity` recompute el hash de cada bloque.

### Procedimiento (manual)

1. Tener bloques reales (caso demo):
  ```bash
   bash scripts/setup-demo-pitch-data.sh
   curl -s http://localhost:3001/verify-integrity | jq
   # { "valid": true, "length": N }  (N > 0; no son siempre 3)
  ```
2. Parar nodos:
  ```bash
   docker compose stop coordinador-nacional coordinador-provincial hospital-donante hospital-receptor
  ```
3. Alterar un campo del payload (no el `hash`, para que deje de coincidir):
  ```bash
   cp data/coordinador-nacional/ledger.json data/coordinador-nacional/ledger.json.backup
   # Cambiar p.ej. "kidney" → "kiduey" en un payload
   nano data/coordinador-nacional/ledger.json
  ```
4. Subir y comprobar:
  ```bash
   docker compose up -d
   curl -s http://localhost:3001/verify-integrity | jq
  ```



### Qué esperar

```json
{
  "valid": false,
  "brokenAt": 0,
  "reason": "Hash del bloque no coincide con su contenido"
}
```

(`brokenAt` es el índice del primer bloque roto; el texto no incluye hashes `abc123`.)

**En** `/infra`**:** la tarjeta del nodo muestra **Cadena rota**. El banner de consistencia puede seguir “ok” entre nodos si todos leen el mismo archivo corrupto, o divergir si solo se editó un `data/<org>/`.

Para volver atrás: restaurar el `.backup` o `./scripts/reset.sh --force`.

---



## Qué se ve en la interfaz (`/infra`)


| Evidencia              | Dónde                                                         |
| ---------------------- | ------------------------------------------------------------- |
| Quorum 3/4             | Tarjeta Quorum y estado de cada nodo                          |
| Ledger alineado / fork | Banner superior + huella (tip hash)                           |
| Cadena de hashes (A9)  | Cada tarjeta: “Cadena ok” / “Cadena rota”                     |
| A1–A8 automatizados    | `bash scripts/setup-demo-attack-scenarios.sh all` (terminal)  |
| Suite de 20 tests      | **Ejecutar verificación** — lista por test, no un único `1/1` |


La suite incluye identidad, endorsement, IoT, RBAC, recepción y quorum. **test16** y **test19** detienen contenedores Docker: dentro de la imagen del dashboard se **saltan**. Para esos dos, en el host:

```bash
npm run test:seguridad
```

Consulta clínica (`/dashboard`) muestra casos; **no** lista rechazos de ataque. Los ataques que no escriben no cambian la ficha.

Tras cambiar el parser de la suite hace falta reconstruir el dashboard:

```bash
docker compose build dashboard && docker compose up -d --no-deps dashboard
```

---



## Resumen de defensas


| Defensa                | Implementación                            | Demo                        |
| ---------------------- | ----------------------------------------- | --------------------------- |
| PKI + firma RSA-SHA256 | Cert en disco del actor, cadena a Root CA | A1, A2, A3                  |
| Endorsement N-of-M     | `nodes/lib/endorsement.js`                | A4, A5, A7                  |
| Replay de assignment   | `compatibilityTimestamp` ≤ 30 min         | A8                          |
| RBAC de lectura        | header `x-actor`                          | A6                          |
| Hash-chain             | `GET /verify-integrity` + `/infra`        | A9                          |
| Quorum de replicación  | 3 de 4 nodos                              | `/infra`, test19 en el host |
| CORS                   | solo `localhost:3000` en el navegador     | no sustituye A6             |


---



## Script automatizado (A1–A8)

```bash
bash scripts/setup-demo-attack-scenarios.sh all
```

- ✓ ESPERADO: rechazado
- ✘ FALLA: aceptado (breach)
- Altura del ledger igual al inicio

---



## Checklist


| Paso  | Comando                                           | Qué esperar                              |
| ----- | ------------------------------------------------- | ---------------------------------------- |
| 0     | `curl :3001/health`                               | nodos up                                 |
| A1–A8 | `bash scripts/setup-demo-attack-scenarios.sh all` | todos rechazados, misma altura           |
| Suite | `/infra` → Ejecutar verificación                  | ~18–20 correctas (2 saltos en Docker)    |
| A9    | editar `ledger.json` + `/verify-integrity`        | `valid: false` y Cadena rota en `/infra` |
| Fin   | restaurar backup o `reset.sh --force`             | cadena válida otra vez                   |


**Actualizado:** septiembre 2026