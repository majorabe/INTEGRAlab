# 🔄 PASO A PASO DETALLADO - INTEGRAlab

**Qué hace CADA comando, qué esperar en cada paso, y por qué**

---

## 🎯 OBJETIVO FINAL

Levantar un **sistema de trasplantes en blockchain** con:
- ✅ 4 organizaciones (coordinador-nacional, coordinador-provincial, hospital-donante, hospital-receptor)
- ✅ Ledger distribuido (hash-encadenado, inmutable)
- ✅ PKI X.509 (firma digital de transacciones)
- ✅ Dashboard web (visualización en tiempo real)

---

## PASO 1: Crear la "Red Privada" con Docker Compose

### 1.1 El Comando
```bash
cd INTEGRAlab
docker compose up --build
```

### 1.2 Qué Hace Exactamente

**Docker Compose** es un orquestador de contenedores. Este comando:

1. **Lee `docker-compose.yml`** — archivo de configuración que define:
   - Qué servicios levantar (ca-setup, 4 nodos, iot-simulator, dashboard)
   - Qué puertos exponen (3001-3004 para nodos)
   - Qué volúmenes compartir (`./certs`, `./data`)
   - Qué dependencias tiene cada servicio

2. **Construye imágenes Docker** (`--build`):
   - Para `ca-setup`: ejecuta `./ca/Dockerfile` → genera PKI
   - Para `nodes`: ejecuta `./nodes/Dockerfile` → levanta nodo blockchain
   - Para `dashboard`: ejecuta `./dashboard/Dockerfile` → levanta UI React

3. **Levanta contenedores EN ESTE ORDEN**:
   ```
   ca-setup (genera jerarquía PKI)
        ↓ (espera a completarse)
   coordinador-nacional (orderer, puerto 3001)
   coordinador-provincial (puerto 3002)
   hospital-donante (puerto 3003)
   hospital-receptor (puerto 3004)
   iot-simulator (comienza a generar telemetría)
   dashboard (UI web, puerto 3000)
   ```

### 1.3 Qué Esperar en Consola

```
[+] Building 45.2s (78/78) FINISHED
 => Building ca-setup...
 => Building nodes...
 => Building dashboard...

[+] Running 7/7
 ✔ Container integralab-ca-setup-1           Exited
 ✔ Container integralab-coordinador-nacional-1  Running
 ✔ Container integralab-coordinador-provincial-1  Running
 ✔ Container integralab-hospital-donante-1   Running
 ✔ Container integralab-hospital-receptor-1  Running
 ✔ Container integralab-iot-simulator-1      Running
 ✔ Container integralab-dashboard-1          Running
```

**Tiempo estimado:** 2-3 minutos (primera vez)

### 1.4 Por Qué Los Contenedores Se Crean en Ese Orden

```
ca-setup DEBE terminar primero porque:
  ├─ Genera certificados X.509 en ./certs
  └─ Los demás contenedores los necesitan para firmar transacciones

Después, los 4 nodos pueden iniciar porque:
  ├─ Cada uno monta ./certs (certificados listos)
  ├─ Cada uno crea ./data/organización/ledger.json (vacío al inicio)
  └─ Se conectan entre sí vía HTTP (peers)

IoT Simulator espera hospital-donante porque:
  └─ Le envía telemetría a ese puerto cada 5 segundos

Dashboard espera a todos los nodos porque:
  └─ Hace requests GET a los 4 puertos (3001-3004)
```

---

## PASO 2: Verificar que la "Red Privada" Está Levantada

### 2.1 El Comando
```bash
# En nueva terminal (mientras docker compose sigue corriendo)
curl -s http://localhost:3001/health | jq
```

### 2.2 Qué Hace

**curl** hace una petición HTTP GET al puerto 3001 (coordinador-nacional) pidiendo `/health`.

El nodo responde con un JSON que muestra:
- Estado: "ok" o "error"
- Número de bloques en el ledger
- Transacciones por tipo
- Últimas 5 transacciones

### 2.3 Qué Esperar (Output Esperado)

```json
{
  "org": "coordinador-nacional",
  "status": "ok",
  "ledgerBlocks": 0,
  "transactionsByType": {},
  "recentTransactions": [],
  "timestamp": "2026-08-31T12:00:00Z"
}
```

**Explicación:**
- `"org": "coordinador-nacional"` → Es el nodo coordinador
- `"ledgerBlocks": 0` → Ledger vacío (no hay transacciones aún)
- `"transactionsByType": {}` → No hay tipos de tx registradas
- `"recentTransactions": []` → Sin transacciones recientes

### 2.4 Verificar Los 4 Nodos

```bash
# Hacerlo para los 4 puertos
echo "=== Coordinador Nacional ===" && curl -s http://localhost:3001/health | jq .ledgerBlocks
echo "=== Coordinador Provincial ===" && curl -s http://localhost:3002/health | jq .ledgerBlocks
echo "=== Hospital Donante ===" && curl -s http://localhost:3003/health | jq .ledgerBlocks
echo "=== Hospital Receptor ===" && curl -s http://localhost:3004/health | jq .ledgerBlocks
```

**Qué Esperar:** Los 4 deberían mostrar `"ledgerBlocks": 0` (sin datos aún)

---

## PASO 3: Inyectar Datos de Prueba

### 3.1 El Comando
```bash
bash scripts/setup-demo-pitch-data.sh
```

### 3.2 Qué Hace (Paso Interno)

Este script ejecuta automáticamente:

#### **3.2.1 Registrar Donante**
```bash
# Paso interno del script:
PAYLOAD='{"donorId":"demo-pitch-donor-001", "bloodType":"O+", ...}'

# 1. Pedir firma al nodo hospital-donante (puerto 3003)
curl -X POST http://localhost:3003/sign -d "{\"payload\":$PAYLOAD}"
  → Nodo responde con una FIRMA DIGITAL (RSA-2048)

# 2. Enviar la transacción con firma al nodo (validación multisig)
curl -X POST http://localhost:3003/tx/donor-registry -d "{\"payload\":..., \"signatures\":[...]}"
  → Nodo VALIDA la firma
  → Nodo crea un BLOQUE con esta transacción
  → Nodo REPLICA a los otros 3 nodos
  → Todos los nodos REVALIDAN independientemente
  → ✅ Bloque CONFIRMADO en los 4 nodos
```

#### **3.2.2 Registrar Paciente**
```bash
# Similar al donante, pero con firma de 2 orgs (multisig)
# Requiere: coordinador-nacional + hospital-donante
# Por qué: esperar lista es decisión de 2 instituciones
```

#### **3.2.3 Crear Asignación**
```bash
# Vincula donante → paciente
# Requiere firma de coordinador-nacional
# Genera un score de compatibilidad HLA
```

#### **3.2.4 Inyectar Telemetría**
```bash
# 5 lecturas de temperatura (simula custodia del órgano)
# Cada lectura: temperatura, humedad, GPS, timestamp
# Crítico: incluye "organId": "demo-pitch-donor-001" (vincula a caso)
```

### 3.3 Qué Esperar en Consola

```
========================================
SETUP: Demo Pitch Data para Jurado
========================================

[1] Verificando que nodos estén levantados...
✓ Nodos disponibles

[2] Registrando donante demo-pitch-donor-001...
✓ Donante registrado: demo-pitch-donor-001

[3] Registrando paciente demo-pitch-patient-001...
✓ Paciente en lista espera: demo-pitch-patient-001

[4] Creando asignación...
✓ Asignación creada

[5] Inyectando telemetría de custodia...
  ✓ Telemetría 1 (4°C)
  ✓ Telemetría 2 (4°C)
  ✓ Telemetría 3 (3°C)
  ✓ Telemetría 4 (3°C)
  ✓ Telemetría 5 (2°C)

========================================
✓ SETUP COMPLETADO
========================================
```

### 3.4 Qué Pasó en el Blockchain Ahora

**Antes del script:**
```
Ledger de cada nodo:
┌─────────────────────┐
│ Block #0 (vacío)    │
└─────────────────────┘
```

**Después del script:**
```
Ledger de cada nodo:
┌─────────────────────────────────────┐
│ Block #0: donor-registry            │ ← Donante registrado
│          [hash: abc123...]          │
├─────────────────────────────────────┤
│ Block #1: waiting-list              │ ← Paciente en espera
│          [hash: def456...]          │
├─────────────────────────────────────┤
│ Block #2: assignment                │ ← Asignación hecha
│          [hash: ghi789...]          │
├─────────────────────────────────────┤
│ Block #3: custody (telemetria 1)    │ ← Custodia 1
│          [hash: jkl012...]          │
├─────────────────────────────────────┤
│ Block #4: custody (telemetria 2)    │ ← Custodia 2
│          [hash: mno345...]          │
├─────────────────────────────────────┤
│ Block #5: custody (telemetria 3)    │ ← Custodia 3
│          [hash: pqr678...]          │
├─────────────────────────────────────┤
│ Block #6: custody (telemetria 4)    │ ← Custodia 4
│          [hash: stu901...]          │
├─────────────────────────────────────┤
│ Block #7: custody (telemetria 5)    │ ← Custodia 5
│          [hash: vwx234...]          │
└─────────────────────────────────────┘

Total: 8 bloques en cada nodo (hash-encadenados)
```

---

## PASO 4: Abrir el Dashboard Web

### 4.1 El Comando
```bash
# En navegador
http://localhost:3000
```

### 4.2 Qué Hace

El puerto 3000 es donde corre **Next.js** (framework React). Cuando abres:

1. Navegador hace petición a `localhost:3000`
2. Servidor Next.js responde con HTML + JavaScript
3. JavaScript en navegador hace fetch a los 4 nodos (3001-3004)
4. React renderiza la UI con los datos

### 4.3 Qué Esperar (Pantalla Principal)

```
┌─────────────────────────────────────────┐
│ INTEGRAlab                              │
│ Coordinación de trasplantes sobre       │
│ ledger real                             │
└─────────────────────────────────────────┘

┌──────────────────┐  ┌──────────────────┐
│ 🟢 Infraestructura │ │ 🔵 Dashboard     │
│ Estado crudo de  │  │ clínico          │
│ nodos            │  │ Proyección GET   │
└──────────────────┘  └──────────────────┘
```

### 4.4 Click en "Dashboard clínico"

Verás:

```
🟢 Ledger íntegro
  Bloques: 8
  Tip Hash: abc123def456...
  Tiempo: 245ms

┌─────────────────────────────────────┐
│ Consulta de casos                   │
│ Ingresa ID que exista en el ledger  │
│                                     │
│ [demo-pitch-donor-001    ] [Buscar] │
│                                     │
│ ← demo-pitch-donor-001 (fixture)    │
└─────────────────────────────────────┘
```

---

## PASO 5: Buscar un Caso y Visualizar

### 5.1 El Comando
```
# En navegador:
1. Escribe: demo-pitch-donor-001
2. Click "Consultar"
```

### 5.2 Qué Hace Internamente

```
Browser → (fetch GET)
  ↓
http://localhost:3001/dashboard/casos/demo-pitch-donor-001
  ↓
Nodo coordinador-nacional
  ├─ Lee el ledger completo (8 bloques)
  ├─ Filtra transacciones del caso ("demo-pitch-donor-001")
  ├─ Construye:
  │  ├─ donorInfo (del bloque #0)
  │  ├─ recipientInfo (del bloque #1)
  │  ├─ assignmentInfo (del bloque #2)
  │  └─ custodyCheckpoints (bloques #3-7)
  ├─ Retorna JSON con todo eso
  ↓
React renderiza la UI
```

### 5.3 Qué Esperar (Visualización)

```
┌─────────────────────────────────────────┐
│ demo-pitch-donor-001                    │
│ Vista Coordinador Nacional              │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 🔵 DONANTE                              │
│ ID: demo-pitch-donor-001                │
│ Sangre: O+                              │
│ Órgano: kidney                          │
│ HLA-A: A2, HLA-B: B7, HLA-DR: DR5      │
│ Preservación: static-cold               │
│ Registrado: 31/8/2026 12:00:00         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 🟢 RECEPTOR                             │
│ ID: demo-pitch-patient-001              │
│ Sangre: O+                              │
│ Urgencia: 3/5                           │
│ HLA-A: A2, HLA-B: B7, HLA-DR: DR4      │
│ En lista desde: 31/8/2026 12:00:05     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 📋 ASIGNACIÓN                           │
│ Donante: demo-pitch-donor-001           │
│ Receptor: demo-pitch-patient-001        │
│ Órgano: kidney                          │
│ Score HLA: 8.5/10                       │
│ Asignado: 31/8/2026 12:00:10           │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 📊 TELEMETRÍA (Gráfico)                 │
│   Temperatura (°C)                      │
│ 4 |     ••                              │
│ 3 |   •••                               │
│ 2 | •  •                                │
│ 1 |                                     │
│ 0 +──────────────────────────────       │
│   0   2   4   6   8  10 (tiempo)       │
│ Mín: 2°C, Máx: 4°C, Promedio: 3.2°C   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ ⏱️ TIMELINE (Eventos)                   │
│ 12:00:00 - donor-registry               │
│           Donante: O+ (kidney)          │
│           Firma: hospital-donante       │
│           Hash: abc123...               │
│ 12:00:05 - waiting-list                 │
│           Paciente: urgencia 3          │
│           Firmas: coord-nac + hosp-don  │
│           Hash: def456...               │
│ 12:00:10 - assignment                   │
│           Score HLA: 8.5                │
│           Firma: coord-nac              │
│           Hash: ghi789...               │
│ 12:00:15 - custody (temp 1)             │
│           4°C, humedad 45%              │
│           GPS: -32.94, -60.63           │
│           Hash: jkl012...               │
│ ... (4 más)                             │
└─────────────────────────────────────────┘
```

---

## PASO 6: Cambiar de Rol y Ver Que Los Datos Cambian

### 6.1 El Comando
```
# En dashboard:
Click en selector "Cambiar rol"
Elige: Hospital Donante (puerto 3003)
```

### 6.2 Qué Hace

```
React cambia estado: role = "hospital-donante"
  ↓
ReadClient cambia baseURL a http://localhost:3003
ReadClient cambia header x-actor a "hospital-donante"
  ↓
Hace fetch a:
http://localhost:3003/dashboard/casos/demo-pitch-donor-001
  ↓
Nodo Hospital Donante procesa:
  ├─ Verifica header x-actor = "hospital-donante"
  ├─ Verifica si el actor tiene permiso para ver este caso
  │  (hospital-donante puede ver casos donde es actor)
  └─ Retorna datos filtrados por permisos
  ↓
React muestra vista Hospital Donante
```

### 6.3 Qué Esperar (La Vista Cambió)

La UI **refresca automáticamente** con:
- Título: "Vista Hospital Donante"
- Datos limitados a lo que **ese rol puede ver**
- Ejemplo: Hospital Donante ve poco del receptor

```
ANTES (Coordinador Nacional - acceso total):
┌─────────────────┐
│ DONANTE       ✅│ ← Ve todo
│ RECEPTOR      ✅│
│ ASIGNACIÓN    ✅│
│ TELEMETRÍA    ✅│
└─────────────────┘

DESPUÉS (Hospital Donante - acceso parcial):
┌─────────────────┐
│ DONANTE       ✅│ ← Ve lo suyo
│ RECEPTOR      ❌│ ← No ve (privacidad)
│ ASIGNACIÓN    ⚠️ │ ← Ve solo su firma
│ TELEMETRÍA    ✅│ ← Ve custodia
└─────────────────┘
```

---

## PASO 7: Verificar Integridad del Blockchain

### 7.1 El Comando
```bash
# En nueva terminal:
curl -s http://localhost:3001/verify-integrity | jq
```

### 7.2 Qué Hace

El nodo recorre **TODOS los bloques** verificando:
1. ¿Cada hash está conectado al anterior?
2. ¿Algún bloque fue modificado retroactivamente?

### 7.3 Qué Esperar

```json
{
  "valid": true,
  "length": 8,
  "lastBlockHash": "vwx234...",
  "hashChain": [
    "abc123...",  // Bloque 0 (donante)
    "def456...",  // Bloque 1 (paciente)
    "ghi789...",  // Bloque 2 (asignación)
    "jkl012...",  // Bloque 3 (telemetría 1)
    ...
  ]
}
```

**Significado:**
- `"valid": true` → La cadena de hashes es íntegra
- Si alguien modifica cualquier byte de cualquier bloque:
  - Su hash cambiaría
  - Dejaría de coincidir con el siguiente
  - `"valid": false` ← Detección automática

---

## 📊 RESUMEN VISUAL: De 0 a Funcional

```
ANTES:
Docker → Red vacía (sin data)
↓
PASO 1-2: docker compose up --build
         Levanta: PKI + 4 nodos + IoT + Dashboard
↓
Blockchain (vacío):
  - 0 bloques
  - 0 transacciones
  - 4 nodos replicados pero sin data
↓
PASO 3: bash scripts/setup-demo-pitch-data.sh
        Inyecta: 1 donante + 1 paciente + 1 asignación + 5 telemetrías
↓
Blockchain (con data):
  - 8 bloques hash-encadenados
  - 8 transacciones
  - Replicadas y validadas en los 4 nodos
↓
PASO 4-5: Abrir http://localhost:3000 + Buscar caso
         Dashboard consume GET /dashboard/casos/:id
↓
RESULTADO:
✅ Visualización de:
   - Donante + Receptor (datos)
   - Asignación (decisión clínica)
   - Telemetría (custodia)
   - Timeline (auditoría)
   - Integridad (hash-chain)
```

---

## 🎯 CONCEPTOS CLAVE EXPLICADOS

### **¿Por qué 4 nodos?**
- Cada nodo es una organización diferente
- Aumenta la confianza (no hay single point of failure)
- Si 1 nodo intenta trucar datos, los otros 3 lo detectan

### **¿Por qué PKI?**
- Firma digital de transacciones (prueba de quién ejecutó qué)
- RSA-2048: 2048 bits de seguridad criptográfica

### **¿Por qué hash-encadenado?**
- Si cambias el bloque #3, su hash cambia
- Eso rompe la cadena (bloque #4 apunta a un hash diferente)
- Detección automática de tampering

### **¿Por qué Multisig (múltiples firmas)?**
- Algunas decisiones requieren consenso
- Ej: esperar lista requiere firma de coordinador + hospital
- Previene decisiones unilaterales

### **¿Por qué Docker?**
- Cada contenedor es un "servidor" aislado
- Simula 4 máquinas diferentes en la red
- Rápido de levantar/limpiar

---

## ✅ CHECKLIST: Qué Debería Pasar en Cada Paso

| Paso | Comando | ¿Qué Esperar? | ✅ |
|------|---------|---------------|-----|
| 1 | `docker compose up --build` | 7 contenedores corriendo | ☐ |
| 2 | `curl http://localhost:3001/health` | JSON con status ok | ☐ |
| 2b | `curl http://localhost:300X/health` x4 | Los 4 nodos responden | ☐ |
| 3 | `bash scripts/setup-demo-pitch-data.sh` | 8 bloques creados | ☐ |
| 4 | Abrir http://localhost:3000 | Dashboard UI aparece | ☐ |
| 5 | Buscar demo-pitch-donor-001 | Donante/Receptor/Asignación/Telemetría | ☐ |
| 6 | Cambiar rol a Hospital Donante | Vista cambia, permisos aplican | ☐ |
| 7 | `curl http://localhost:3001/verify-integrity` | `"valid": true` | ☐ |

---

**Generado:** 31 de Agosto 2026
