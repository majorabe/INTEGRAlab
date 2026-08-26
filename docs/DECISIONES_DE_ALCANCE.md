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
