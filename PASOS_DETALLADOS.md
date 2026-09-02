# PASOS DETALLADOS — INTEGRAlab

**Qué comando correr, qué esperar, y por qué.**

Desde la **raíz del repo** (`INTEGRAlab/`).

---

## Objetivo

Red de 4 organizaciones sobre un ledger hash-encadenado, con PKI X.509. El dashboard **no escribe**. 

La telemetría IoT **no arranca al levantar Docker**: es trazabilidad de un órgano **ya asignado**.

---

## Cuándo se genera un bloque

La red en marcha **no** produce bloques. Cada bloque es un hecho con endorsement y quorum (3/4).


| #   | Hecho (`txType`) | Quién lo dispara           | Firmas                                  | ¿Cuándo?                                                                                        |
| --- | ---------------- | -------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | `donor-registry` | `POST /tx/donor-registry`  | hospital-donante                        | Al registrar el donante                                                                         |
| 2   | `waiting-list`   | `POST /tx/waiting-list`    | coordinador-nacional + otra org         | Al cargar el paciente en lista                                                                  |
| 3   | `assignment`     | `POST /tx/assignment`      | coordinador-nacional + hospital-donante | Tras `POST /compatibility/query` (timestamp fresco). **Inicio de trazabilidad**                 |
| 4   | `custody`        | IoT `POST /custody/ingest` | `iot:sensor-…` + un hospital            | Solo si hay `organId` = donorId **y** assignment. 1 lectura ≈ 1 bloque, cada 5 s, hasta la recepción |
| 5   | `reception`      | `POST /tx/reception`       | hospital-receptor + coordinador-nacional | El órgano llega al hospital receptor. **Cierra** el circuito: no hay más custody |


**No generan bloques:** `docker compose up`, `GET /health`, `GET /dashboard/`*, `POST /compatibility/query`, `POST /sign`, `GET /verify-integrity`.

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

Si **después del script** la altura sigue subiendo sola, el IoT no se detuvo → PASO 1 de nuevo.

---



## PASO 4 — Cargar el caso de demo (donante, lista, asignación)

Hasta acá (pasos 1–3) solo **encendiste la red**. Los nodos están vivos, el dashboard está abierto, pero **no hay ningún paciente ni donante**. Es como un hospital con el sistema prendido y la historia clínica vacía. El paso 4 es el que **carga un caso de demostración** en esa historia.

No vas a completar formularios en la web. El script escribe por vos, de una sola vez, el circuito completo: donante, lista, asignación, traslado IoT y **recepción** en el hospital receptor. Al terminar, el IoT ya no escribe.

### En palabras (qué está pasando)

Imaginá un único caso de trasplante de riñón, no un padrón nacional:

1. **Se registra un donante** (`demo-pitch-donor-001`). Quedan grabados grupo sanguíneo, órgano (riñón), HLA y método de preservación.
2. **Se carga un paciente en lista de espera** (`demo-pitch-patient-001`). Quedan grabados grupo sanguíneo, HLA y urgencia (3 de 5). En esta demo **hay un solo candidato**, no una grilla de cientos de personas.
3. **Se mira si son compatibles** (grupo y HLA). Eso no graba nada: solo obtiene un “sello de hora” para poder asignar.
4. **Se asigna el órgano** de ese donante a ese paciente. Recién ahí el órgano “sale” a transitar.
5. **Arranca el sensor de temperatura** del contenedor. Escribe unas pocas lecturas de frío (incluye una alerta en la #5).
6. **El hospital receptor confirma la llegada**. Ese bloque cierra la trazabilidad. El script **detiene el IoT**: la altura del ledger deja de subir.

Esos pasos son el script. Vos no los ves uno a uno en el dashboard mientras corre: al terminar, el caso ya está **cerrado**.

### Dónde mirarlo (los dos paneles)

Después del script, **refrescá** `/infra` y `/dashboard`. `/dashboard` muestra el caso clínico (incluido **Recibido**). `/infra` muestra la red: la altura ya **no sube**.


| Qué querés ver                                              | Dónde                                                        | Qué vas a encontrar                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Red (nodos, altura, hashes, tests)                          | `http://localhost:3000/infra`                                | Los 4 nodos, quorum, consistencia. Altura estable (el IoT ya no escribe).                               |
| Tablero clínico                                             | `http://localhost:3000/dashboard`                            | Donante entregado, paciente recibido, match HLA, contenedor cerrado.                                    |
| Ficha completa (gráfico de temperatura, línea de tiempo)    | `http://localhost:3000/dashboard/casos/demo-pitch-donor-001` | Ciclo hasta **Recepción**. También sirve el ID `demo-pitch-patient-001`.                                |


En `/dashboard` deberías reconocer:

- 1 donante `demo-pitch-donor-001` (O+, riñón) con estado **Entregado**
- 1 paciente `demo-pitch-patient-001` con estado **Recibido**
- Asignación con score HLA y píldora **Recibido**
- Contenedor **Entregado** / circuito cerrado
- En la ficha: las 5 etapas (Donante → Lista → Asignación → Traslado → Recepción) en teal

Si el tablero dice “Sin actividad clínica”, el script no corrió o el ledger se reseteó.

### Comando

```bash
bash scripts/setup-demo-pitch-data.sh
```

`bash` (no `sh` ni Node): no depende del bit `+x` y evita dash. Los nodos tienen que estar en `localhost:3001` / `3003`.

### Qué hace (interno)


| Paso del script                                   | Endpoint                                           | ¿Bloque?                                      |
| ------------------------------------------------- | -------------------------------------------------- | --------------------------------------------- |
| Firmar + registrar donante `demo-pitch-donor-001` | `/sign` + `/tx/donor-registry`                     | 1 (`donor-registry`)                          |
| Firmar + lista `demo-pitch-patient-001`           | `/sign` ×2 + `/tx/waiting-list`                    | 1 (`waiting-list`, 2 orgs)                    |
| Compatibilidad HLA                                | `/compatibility/query`                             | **0** (solo timestamp)                        |
| Asignación (nacional + hospital-donante)          | `/tx/assignment`                                   | 1 (`assignment`) = **inicio de trazabilidad** |
| Arrancar IoT                                      | `docker compose --profile iot up -d iot-simulator` | `custody` (unas lecturas, ~5 s c/u)           |
| Esperar ≥5 lecturas                               | `GET /dashboard/overview`                          | **0** (solo espera)                           |
| Recepción (receptor + coordinador nacional)       | `/tx/reception`                                    | 1 (`reception`) = **cierre de trazabilidad**  |
| Detener IoT                                       | `docker compose --profile iot stop iot-simulator`  | no hay más bloques                            |


El simulador espera assignment en `GET /dashboard/casos/demo-pitch-donor-001`, después manda lecturas con `organId=demo-pitch-donor-001`. Lectura #5 puede salir de rango (alerta de frío). Tras la recepción, el nodo **rechaza** más custody y el script para el contenedor.

### Qué esperar en consola

```
SETUP: caso clínico demo-pitch
✓ Donante registrado
✓ Paciente en lista de espera
✓ compatibilityTimestamp=...
✓ Asignación creada
✓ IoT arriba
✓ Traslado registrado (N lecturas)
✓ Órgano recibido en hospital receptor. Circuito cerrado.
✓ IoT detenido
✓ CASO CLÍNICO CERRADO
```

Logs IoT: `docker compose logs iot-simulator`  
Primero “esperando assignment”, después `temp=… -> bloque #N`, y al final recepción.

### Ledger

Después del assignment, **antes** de que IoT escriba:

```
#0  donor-registry
#1  waiting-list
#2  assignment
Altura: 3
```

Al terminar el script:

```
#3 … #N   custody   organId = demo-pitch-donor-001
#N+1      reception hospital-receptor
Altura: estable (el IoT ya no escribe)
```

En `/infra` la altura **deja de ser 0 acá**, no en el `up`, y **deja de crecer** cuando cierra la recepción.

---



## PASO 5 — Ver el tablero (después del paso 4)



### Comando

Abrí **los dos**:

- `http://localhost:3000/infra` — nodos, quorum, altura **estable**
- `http://localhost:3000/dashboard` — caso **recibido**, contenedor cerrado

Ficha con gráfico: `http://localhost:3000/dashboard/casos/demo-pitch-donor-001`

### Qué esperar

En `/infra` la altura de los 4 nodos ya no es 0 **y no sigue subiendo**. En `/dashboard` el traslado figura **Entregado**. La ficha muestra las 5 etapas hasta Recepción.

Selector **Organización** (solo en `/dashboard`): elige desde qué réplica leer. Misma cadena.

---



## PASO 6 — Integridad



### Comando

```bash
curl -s http://localhost:3001/verify-integrity | jq
```



### Qué esperar

```json
{ "valid": true, "length": 9 }
```

`length` = `ledgerHeight` de `/health` (3 clínicos + N custody + 1 reception). No escribe bloques. Si alguien altera un `ledger.json` a mano → `"valid": false`.

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
        ↓  donante + lista + asignación + custody + recepción; IoT detenido
http://localhost:3000/infra  y  /dashboard
        ↓  caso cerrado; altura estable
http://localhost:3000/dashboard/casos/demo-pitch-donor-001
        ↓  ficha con gráfico y etapa Recepción
curl /verify-integrity  →  valid: true
```

---



## Por qué así

- **4 nodos:** 4 orgs, quorum 3/4.
- **PKI:** cada tx lleva firma X.509.
- **Hash-chain:** un byte cambiado rompe `/verify-integrity`.
- **Multisig:** lista y assignment no los decide una sola org; custody = IoT + hospital; recepción = hospital receptor + coordinador nacional.
- **IoT no va en el** `up`**:** nodo up ≠ órgano en tránsito. Sin assignment no hay `organId` ligado al caso. Tras `reception` no hay más custody.
- **Dashboard al principio:** tablero vacío. El paso 4 carga **y cierra** el caso demo.

---



## Checklist


| Paso | Comando                                 | Esperar                                          |
| ---- | --------------------------------------- | ------------------------------------------------ |
| 1    | `./scripts/reset.sh --force`            | Compose down **con IoT**; `./data/` vacío        |
| 2    | `docker compose up --build -d`          | 4 nodos + dashboard; **sin** IoT                 |
| 3    | `curl …:3001/health` y `/infra`         | `ledgerHeight: 0` en los 4                       |
| 4    | `bash scripts/setup-demo-pitch-data.sh` | Circuito cerrado: donante → recepción; IoT parado |
| 5    | `/infra` y `/dashboard`                 | Caso recibido; altura estable                     |
| 6    | `curl …/verify-integrity`               | `"valid": true`                                  |


---

