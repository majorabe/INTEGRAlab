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

## 5. Sin interfaz gráfica

El prototipo se opera y demuestra vía API REST (curl / scripts / colección de pruebas), no con una UI. Es una decisión de tiempo, no de arquitectura — la capa de presentación no es donde está el valor técnico que este proyecto necesita demostrar.

## 6. Dashboard de solo lectura: Capa de proyección del ledger (Fase 1)

El prototipo implementa una capa de lectura (_projection layer_) que **no modifica ni reemplaza el ledger authoritative**, sino que lo transforma en formatos consumibles por una interfaz de usuario.

**Arquitectura:**

El ledger sigue siendo la única fuente de verdad (append-only, inmutable, hash-encadenado). La proyección es una serie de endpoints GET que:
1. Leen el ledger completo via `ledger.readLedger()`
2. Transforman los datos según el caso consultado (donorId o patientId)
3. Retornan vistas consolidadas: estado del caso, timeline de eventos, series de telemetría, salud del nodo

**Endpoints implementados (`nodes/lib/dashboard-projection.js` + `nodes/server.js` líneas 233–359):**

- `GET /dashboard/casos/:id` → estado consolidado (donorInfo, recipientInfo, assignmentInfo, custodyCheckpoints)
- `GET /dashboard/casos/:id/timeline` → lista ordenada de eventos con timestamp/actor/hash/payload resumido
- `GET /dashboard/casos/:id/telemetria` → serie temporal de lecturas de sensores (temperatura, humedad, etc.)
- `GET /dashboard/health` → salud del nodo: conteo de bloques, transacciones por tipo, últimas 5 transacciones

**Control de acceso:**

- Endpoints de caso (`/dashboard/casos/:id/*`): requieren header `x-actor` que sea self, auditor, coordinador-nacional o coordinador-provincial
- `/dashboard/health`: sin control de acceso (es un health check público)

**Por qué:**

Esta es una decisión arquitectónica para Fase 1 (prototipo pre-jurado). En Fase 2 (UI real), una interfaz web consumirá estos endpoints. Al separar la capa de proyección del ledger authoritativo, garantizamos que:
1. **Integridad:** Ningún cambio en la UI afecta la seguridad o validez del ledger
2. **Auditabilidad:** El ledger permanece inmutable y verificable independientemente de cómo se presente
3. **Escalabilidad:** Futuros componentes (caché, índices, replicación de vistas) se agregan sin tocar endorsement ni validación

En producción (Hyperledger Fabric real), esta capa equivaldría a un indexador externo (ej. ElasticSearch) o un gateway que hace queries a `world state` via chaincode query, no invoke.

**No duplica datos:** La proyección es transformación pura sobre el ledger en tiempo de lectura. No hay caché persistente ni base de datos secundaria.

## 7. Dashboard Frontend (Fase 2) — UI de solo consulta

El frontend en `dashboard/` **no escribe el ledger**. Consume únicamente GET de la proyección de Fase 1 (`/dashboard/casos/:id`, `/timeline`, `/telemetria`, `/dashboard/health`). No llama `/sign`, `/tx`, `/ledger` ni `/internal/*`.

El selector de rol elige **desde qué nodo se lee** (puertos 3001–3004), no un login de usuario ni una identidad extra.

**Roles de UI (organizaciones reales):**

- Coordinador Nacional (3001)
- Coordinador Provincial (3002)
- Hospital Donante (3003)
- Hospital Receptor (3004)
- Vista IoT: solo telemetría, leyendo el nodo de custodia (hospital-donante). No es una org nueva.

**Auditor no es un rol de UI.** No hay certificado de auditor en la PKI. El valor `x-actor: auditor` puede aparecer en tests del nodo; no se ofrece en el selector.

**Rutas:**

- `/` — puerta (infra vs consulta)
- `/infra` — diagnóstico de nodos (fuera del dashboard clínico)
- `/dashboard` — consulta clínica de solo lectura

**Por qué no hay escrituras en el front:** el valor del prototipo está en el ledger, la PKI y el endorsement. La UI es una proyección. Inventar o mutar datos desde React repetiría el error del INTEGRA-MVP simulado.

**Seguridad en el cliente:**

- El cliente no maneja claves privadas
- Header `x-actor` = organización del nodo que se consulta (la vista IoT usa `hospital-donante` porque `iot` no está en el access control de los endpoints)
- No hay sesiones de usuario

Ver `dashboard/lib/read-client.ts`.

## 8. Convención de nombres para test data (Fase 2 dashboard development)

Para evitar conflictos entre data de pruebas (18 tests de seguridad, Fase 1), data de auditoría, y data de desarrollo del dashboard (Fase 2), se establece una convención de prefijos:

| Prefijo | Uso | Ejemplo |
|---------|-----|---------|
| `test{NN}-{rol}-*` | Suite 01–20 (`rol` = donor, patient, organ) | `test05-donor-a3f2`, `test17-donor-3-b1c0` |
| `test-dash-{rol}-*` | Endpoints del dashboard | `test-dash-donor-9e2d` |
| **`demo-dev-*`** | **Desarrollo Fase 2 (interactivo)** | **`demo-dev-donor-001`, `demo-dev-patient-001`** |
| **`demo-donor-*` / `demo-patient-*`** | **Demo clínica (pitch)** | **`demo-donor-001`, `demo-patient-001`** |

**Reglas:**
- Cada fase/feature usa su propio prefijo
- No reutilizar prefijos existentes en nuevos desarrollo
- `demo-dev-*` es para cualquier iteración de desarrollo interactivo
- `demo-pitch-*` es **read-only** desde el momento que se crea — no hacer cambios después de que la data está en el ledger
- Permite reverting a "estado limpio" simplemente filtrando por prefijo en auditorías posteriores

**En la Fase 2 (dashboard):**
- Usar `demo-dev-donor-001`, `demo-dev-patient-001`, etc. para testeos interactivos
- La convención permite diferenciar en auditorías: ¿fue data de demo de juro o de desarrollo?
- Post-demo: los datos con prefijo `demo-pitch-*` quedan como evidencia del flujo de jurado

## 9. Vinculación de telemetría a casos (organId)

La proyección (`dashboard-projection.js`) une custody a un caso si `payload.organId === caseId` (el donorId).

**Regla de nodo (no solo de UI):** `/tx/custody` y `/custody/ingest` exigen `organId` y un `assignment` previo de ese `donorId`. Sin eso: 400/409, sin bloque.

El simulador incluye `organId` (env `ORGAN_ID`) y espera el assignment antes de transmitir.

## 10. Telemetría: no es ruido de red

`iot-simulator` **no** forma parte de `docker compose up`. Usa el profile `iot` y se levanta al final de `scripts/setup-demo-pitch-data.sh` (o a mano: `ORGAN_ID=<donorId> docker compose --profile iot up -d iot-simulator`).

El payload lleva el schema real (`temperaturaC`, `humedadPct`, `gps`, `fueraDeRango`) **más** `organId`. No hay stream “huérfano” de fondo: o el órgano está asignado y hay custody vinculada, o no hay telemetría.

`extractTelemetrySeries()` sigue identificando lecturas por `temperaturaC`.

