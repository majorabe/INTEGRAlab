# PASOS DETALLADOS — INTEGRAlab

**Qué comando correr, qué esperar, y por qué.**

Desde la **raíz del repo** (`INTEGRAlab/`).

---

## Objetivo

Red de 4 organizaciones sobre un ledger hash-encadenado, con PKI X.509. El dashboard **no escribe**. La telemetría IoT **no arranca al levantar Docker**: es trazabilidad de un órgano **ya asignado**.

---

## Cuándo se genera un bloque

La red en marcha **no** produce bloques. Cada bloque es un hecho con endorsement y quorum (3/4).

| # | Hecho (`txType`) | Quién lo dispara | Firmas | ¿Cuándo? |
|---|------------------|------------------|--------|----------|
| 1 | `donor-registry` | `POST /tx/donor-registry` | hospital-donante | Al registrar el donante |
| 2 | `waiting-list` | `POST /tx/waiting-list` | coordinador-nacional + otra org | Al cargar el paciente en lista |
| 3 | `assignment` | `POST /tx/assignment` | coordinador-nacional + hospital-donante | Tras `POST /compatibility/query` (timestamp fresco). **Inicio de trazabilidad** |
| 4 | `custody` | IoT `POST /custody/ingest` | `iot:sensor-…` + un hospital | Solo si hay `organId` = donorId **y** assignment de ese donante. 1 lectura ≈ 1 bloque, cada 5 s |

**No generan bloques:** `docker compose up`, `GET /health`, `GET /dashboard/*`, `POST /compatibility/query`, `POST /sign`, `GET /verify-integrity`.

Si el IoT escribe **antes** del assignment (o sin `organId`): 400/409 y **no** hay bloque.

---

## PASO 1 — Limpiar (si ya habías levantado)

### Comando
```bash
./scripts/reset.sh --force
```

`--force` solo salta el “escribí `si`”. `--with-certs` (con **s**) borra también `./certs/`. `--with-cert` no existe.

### Qué hace
1. Baja **todos** los servicios de este proyecto, **incluido IoT** (`COMPOSE_PROFILES=iot docker compose down --remove-orphans`). Sin el profile `iot`, el simulador quedaba vivo y seguía escribiendo bloques.
2. Vacía `./data/` (los `ledger.json`; no hay SQL).
3. Deja `./certs/` salvo `--with-certs`.

### Qué esperar
```
✓ Compose services stopped
✓ Ledger data cleared (./data/)
Next step: docker compose up --build -d
```

Comprobar que no quedó nada de este stack:
```bash
docker compose --profile iot ps -a
```
No debería haber `integralab-*-1` en Running.

---

## PASO 2 — Levantar la red (sin IoT)

### Comando
```bash
docker compose up --build -d
```

`-d` = detached (prompt libre). Logs: `docker compose logs -f`.  
`--build` reconstruye imágenes (hace falta si cambió código de nodos o dashboard).

### Qué hace
Lee `docker-compose.yml` y, en orden:

1. `ca-setup` → PKI en `./certs` y **termina**
2. 4 nodos: nacional `:3001` (orderer), provincial `:3002`, donante `:3003`, receptor `:3004`
3. `dashboard` en `:3000`

`iot-simulator` está en profile `iot`: **no** arranca. No hay telemetría ni bloques custody.

El dashboard ya está en 3000. **No** corras `npm run dev` (mismo puerto).

### Qué esperar
```
[+] Running 6/6
 ✔ ca-setup                         Exited
 ✔ coordinador-nacional             Running
 ✔ coordinador-provincial           Running
 ✔ hospital-donante                 Running
 ✔ hospital-receptor                Running
 ✔ dashboard                        Running
```

**No** esperes `iot-simulator Running`. Si aparece, es un contenedor viejo: volvé a `./scripts/reset.sh --force`.

Tiempo: 2–3 min la primera vez.

---

## PASO 3 — Comprobar red vacía

### Comando
```bash
curl -s http://localhost:3001/health | jq '{org,status,ledgerHeight,tipHash}'
```

Los 4 nodos:
```bash
for p in 3001 3002 3003 3004; do echo "=== :$p ==="; curl -s http://localhost:$p/health | jq '{org,status,ledgerHeight,tipHash}'; done
```

Navegador: `http://localhost:3000/infra`

### Qué hace
`GET /health` es infra (no la proyección clínica). Devuelve `ledgerHeight` (no `ledgerBlocks`; ese nombre es de `GET /dashboard/health`).

### Qué esperar
```json
{
  "org": "coordinador-nacional",
  "status": "ok",
  "ledgerHeight": 0,
  "tipHash": null
}
```

Los 4 en altura **0**. En `/infra`: nodos up, tip vacío.  
En `/dashboard`: aviso de **red viva, ledger clínico vacío**.

Si la altura sube sola, el IoT sigue vivo → PASO 1 de nuevo.

---

## PASO 4 — Hechos clínicos + inicio de trazabilidad

### Comando
```bash
bash scripts/setup-demo-pitch-data.sh
```

`bash` (no `sh` ni Node): no depende del bit `+x` y evita dash. Los nodos tienen que estar en `localhost:3001` / `3003`.

### Qué hace (interno)

| Paso del script | Endpoint | ¿Bloque? |
|-----------------|----------|----------|
| Firmar + registrar donante `demo-pitch-donor-001` | `/sign` + `/tx/donor-registry` | 1 (`donor-registry`) |
| Firmar + lista `demo-pitch-patient-001` | `/sign` ×2 + `/tx/waiting-list` | 1 (`waiting-list`, 2 orgs) |
| Compatibilidad HLA | `/compatibility/query` | **0** (solo timestamp) |
| Asignación (nacional + hospital-donante) | `/tx/assignment` | 1 (`assignment`) = **inicio de trazabilidad** |
| Arrancar IoT | `docker compose --profile iot up -d iot-simulator` | `custody` cada ~5 s |

El simulador espera assignment en `GET /dashboard/casos/demo-pitch-donor-001`, después manda lecturas con `organId=demo-pitch-donor-001`. Lectura #5 puede salir de rango (alerta de frío).

### Qué esperar en consola
```
SETUP: caso clínico demo-pitch
✓ Donante registrado
✓ Paciente en lista de espera
✓ compatibilityTimestamp=...
✓ Asignación creada
✓ IoT arriba
✓ CASO CLÍNICO LISTO
```

Logs IoT: `docker compose logs -f iot-simulator`  
Primero “esperando assignment”, después `temp=… -> bloque #N`.

Cortar telemetría: `docker compose stop iot-simulator`

### Ledger
Después del assignment, **antes** de que IoT escriba:
```
#0  donor-registry
#1  waiting-list
#2  assignment
Altura: 3
```

Con IoT (unos segundos):
```
#3+ custody   organId = demo-pitch-donor-001  (crece cada 5 s)
```

En `/infra` la altura **deja de ser 0 acá**, no en el `up`.

---

## PASO 5 — Dashboard

### Comando
Abrir `http://localhost:3000` (ya está en Compose).

### Qué esperar
Puerta: **Infraestructura** (`/infra`) vs **Dashboard clínico** (`/dashboard`).

- `/infra` = red (altura, quorum, hashes)
- `/dashboard` = **un** caso por ID. No es un HIS. No escribe bloques.

Consultar: `demo-pitch-donor-001` (o patientId `demo-pitch-patient-001`).

Deberías ver el ciclo: Donante → Lista → Asignación → En tránsito. El gráfico se refresca cada 5 s si el IoT corre. Vacío con assignment listo: esperá o mirá logs del simulador.

Selector **“Leer réplica”**: elige el nodo (3001–3004). Misma cadena, no es un login de médico ni un filtro de privacidad en el API.

---

## PASO 6 — Integridad

### Comando
```bash
curl -s http://localhost:3001/verify-integrity | jq
```

### Qué esperar
```json
{ "valid": true, "length": 8 }
```

`length` = `ledgerHeight` de `/health` (3 clínicos + N de IoT). No escribe bloques. Si alguien altera un `ledger.json` a mano → `"valid": false`.

---

## Resumen del recorrido

```
./scripts/reset.sh --force
        ↓  contenedores de este proyecto abajo (incl. IoT), ./data vacío
docker compose up --build -d
        ↓  PKI + 4 nodos + dashboard; IoT NO; altura 0
curl /health  y  /infra
        ↓  ledgerHeight: 0 en los 4
bash scripts/setup-demo-pitch-data.sh
        ↓  3 bloques clínicos + IoT → custody cada 5 s
http://localhost:3000/dashboard  →  demo-pitch-donor-001
curl /verify-integrity  →  valid: true
```

---

## Por qué así

- **4 nodos:** 4 orgs, quorum 3/4.
- **PKI:** cada tx lleva firma X.509.
- **Hash-chain:** un byte cambiado rompe `/verify-integrity`.
- **Multisig:** lista y assignment no los decide una sola org; custody = IoT + hospital.
- **IoT no va en el `up`:** nodo up ≠ órgano en tránsito. Sin assignment no hay `organId` ligado al caso.
- **Dashboard vacío al principio:** no lista pacientes; sin ID en el ledger no hay ficha.

---

## Checklist

| Paso | Comando | Esperar |
|------|---------|---------|
| 1 | `./scripts/reset.sh --force` | Compose down **con IoT**; `./data/` vacío |
| 2 | `docker compose up --build -d` | 4 nodos + dashboard; **sin** IoT |
| 3 | `curl …:3001/health` y `/infra` | `ledgerHeight: 0` en los 4 |
| 4 | `bash scripts/setup-demo-pitch-data.sh` | 3 bloques clínicos + IoT escribiendo |
| 5 | `http://localhost:3000/dashboard` → `demo-pitch-donor-001` | Donante, lista, asignación, gráfico que crece |
| 6 | `curl …/verify-integrity` | `"valid": true` |

---

**Actualizado:** 1 de septiembre 2026
