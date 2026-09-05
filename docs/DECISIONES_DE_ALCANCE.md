# Decisiones de alcance del prototipo INTEGRA

Este documento existe para que quede explícito, ante el jurado y ante cualquier lector técnico del repo, dónde el prototipo simplifica deliberadamente la arquitectura de producción descrita en el Paso 2, y por qué. Ninguna de estas decisiones contradice el diseño propuesto — todas están tomadas para maximizar aprendizaje real y control total sobre la demo en el tiempo disponible.

## 1. Ledger propio, no Hyperledger Fabric real

El prototipo implementa desde cero los mecanismos que Fabric provee out-of-the-box: identidad por certificado (equivalente a MSP), canales de confidencialidad, política de endorsement (múltiples firmas de organizaciones distintas antes de aceptar una transacción), y un ledger append-only con encadenamiento de hashes que hace detectable cualquier alteración retroactiva.

**Por qué:** construirlo a mano demuestra comprensión de cada control de seguridad en vez de la configuración de una herramienta de terceros, y da control total sobre la demo en vivo sin depender de la complejidad operativa de un despliegue real de Fabric (CAs, MSPs, `configtx`, lifecycle de chaincode, ordering service Raft).

La arquitectura de **producción** propuesta para INTEGRA sigue siendo Hyperledger Fabric, tal como se justifica en el Paso 2 (Tabla 1: comparativa de plataformas blockchain).

## 2. RSA-2048 en vez de ECDSA P-256

El Paso 2 especifica ECDSA P-256 para la firma de telemetría IoT en el edge. El prototipo usa RSA-2048 para todos los certificados y firmas (organizaciones e IoT).

**Por qué:** `node-forge` (la librería elegida para generar y manejar certificados X.509 en Node.js) tiene soporte maduro y confiable para RSA, pero su soporte de ECDSA para firma/verificación de certificados es experimental. RSA-2048 ofrece garantías criptográficas equivalentes para los fines del prototipo (no es la elección para producción a escala de miles de dispositivos IoT, donde ECDSA es preferible por tamaño de firma y performance — eso se mantiene como especificación de producción).

## 3. Nomenclatura de actores institucionales

El prototipo usa roles genéricos (`coordinador-nacional`, `coordinador-provincial`, `hospital-donante`, `hospital-receptor`) en lugar de nombrar una entidad real como INCUCAI directamente en el código y la infraestructura.

**Por qué:** mientras no exista un acuerdo institucional formal, es más honesto y prudente no atar el prototipo técnico al nombre de un organismo real. Esto además hace que el mismo código sirva sin modificaciones para la fase de replicación regional (Brasil/SNT, México/CENATRA), que es uno de los objetivos explícitos del proyecto.

## 4. Consenso simplificado (no Raft real)

Cuando un nodo valida y acepta una transacción, la propaga a los demás nodos participantes vía una llamada HTTP interna (`/internal/replicate`). Cada nodo que recibe el bloque **vuelve a validar de forma independiente**: recalcula el hash, verifica que encadene con su propio último bloque, y reverifica cada firma. Si algo no coincide, rechaza el bloque.

**Por qué:** esto reproduce la propiedad de seguridad más importante de un sistema distribuido para este dominio — que ningún nodo puede imponer unilateralmente una versión falsa del ledger a los demás — sin implementar un protocolo de consenso Raft/BFT completo, que excede el alcance de un prototipo de concurso.

## 5. UI de consulta, no de escritura

Hay un dashboard Next.js (`/dashboard` clínico y `/infra` de red). **No escribe el ledger.** La demo clínica se carga con `scripts/setup-demo-pitch-data.sh`; los ataques con `scripts/setup-demo-attack-scenarios.sh`. Curl y la suite de tests siguen siendo la forma de ejercer escritura y defensa.

**Por qué:** el valor del prototipo está en el ledger, la PKI y el endorsement. La UI es una proyección. Inventar o mutar datos desde React repetiría el error de un MVP simulado.

## 6. Dashboard de solo lectura: capa de proyección del ledger

El prototipo implementa una capa de lectura (_projection layer_) que **no modifica ni reemplaza el ledger authoritative**, sino que lo transforma en formatos consumibles por la interfaz.

**Arquitectura:**

El ledger sigue siendo la única fuente de verdad (append-only, inmutable, hash-encadenado). La proyección es una serie de endpoints GET que:
1. Leen el ledger vía `ledger.readLedger()`
2. Transforman los datos según el caso (donorId o patientId)
3. Retornan vistas: estado del caso, timeline, telemetría, overview clínico

**Endpoints (`nodes/lib/dashboard-projection.js`):**

- `GET /dashboard/overview` → tablero (conteos, donantes, lista, asignaciones)
- `GET /dashboard/casos/:id` → estado consolidado
- `GET /dashboard/casos/:id/timeline` → eventos ordenados
- `GET /dashboard/casos/:id/telemetria` → lecturas del contenedor
- `GET /dashboard/health` → salud del nodo

**Control de acceso:** los endpoints de caso y overview requieren header `x-actor` (self, auditor, coordinador-nacional o coordinador-provincial). `/dashboard/health` es público.

**Por qué:** ningún cambio en la UI afecta la validez del ledger. En producción (Fabric) esto equivaldría a un indexador externo o a queries de world state, no a invoke.

**No duplica datos:** transformación en tiempo de lectura. No hay caché persistente ni base secundaria.

## 7. Frontend: lectura fija, dos paneles

El frontend en `dashboard/` **no llama** `/sign`, `/tx`, `/ledger` ni `/internal/*`.

La consulta clínica lee siempre el coordinador nacional (`x-actor: coordinador-nacional`). No hay selector de organización en el header: las cuatro réplicas deben coincidir; cambiar de nodo no cambia el caso clínico.

**Rutas:**

- `/` — puerta (infra vs consulta)
- `/infra` — salud de los 4 nodos, integridad, verificación A1–A9 (independiente del tablero clínico)
- `/dashboard` — consulta de solo lectura
- `/dashboard/casos` — listado
- `/dashboard/casos/:id` — ficha + telemetría
- `/dashboard/estadisticas` — resumen clínico

El cliente no maneja claves privadas. Ver `dashboard/lib/read-client.ts`.

## 8. Convención de nombres en el ledger

| Prefijo | Uso | Ejemplo |
|---------|-----|---------|
| `test{NN}-{rol}-*` | Suite 01–20 (`rol` = donor, patient, organ) | `test05-donor-a3f2`, `test17-donor-3-b1c0` |
| `test-dash-{rol}-*` | Script de endpoints del dashboard | `test-dash-donor-9e2d` |
| `demo-donor-*` / `demo-patient-*` | Caso clínico de demo (pitch) | `demo-donor-001`, `demo-patient-001` |

**Reglas:** no reutilizar prefijos entre demo y tests. Tras un `reset.sh`, el ledger queda vacío; el script de pitch vuelve a crear `demo-*`.

## 9. Vinculación de telemetría a casos (organId)

La proyección (`dashboard-projection.js`) une custody a un caso si `payload.organId === caseId` (el donorId).

**Regla de nodo (no solo de UI):** `/tx/custody` y `/custody/ingest` exigen `organId` y un `assignment` previo de ese `donorId`. Sin eso: 400/409, sin bloque.

El simulador incluye `organId` (env `ORGAN_ID`) y espera el assignment antes de transmitir.

## 10. Telemetría: no es ruido de red

`iot-simulator` **no** forma parte de `docker compose up`. Usa el profile `iot` y se levanta al final de `scripts/setup-demo-pitch-data.sh` (o a mano: `ORGAN_ID=<donorId> docker compose --profile iot up -d iot-simulator`).

El payload lleva el schema real (`temperaturaC`, `humedadPct`, `gps`, `fueraDeRango`) **más** `organId`. No hay stream “huérfano” de fondo: o el órgano está asignado y hay custody vinculada, o no hay telemetría.

`extractTelemetrySeries()` sigue identificando lecturas por `temperaturaC`.

