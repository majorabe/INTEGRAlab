# INTEGRAlab

**Sistema de Coordinación Distribuida de Trasplantes de Órganos con Blockchain**

Prototipo de plataforma que implementa un ledger blockchain personalizado para coordinación segura de trasplantes de órganos entre hospitales, con telemetría en tiempo real y verificación de compatibilidad HLA.

---

## 📊 Estado General del Proyecto

```
Fase 1: Backend Blockchain + Endpoints de Lectura ✓ COMPLETO (18/18 tests)
Fase 2: Dashboard Frontend                        ⏳ EN PROGRESO (Core completo)
  - Componentes base: TelemetryChart, CaseDetail, Timeline ✓
  - Dashboards por rol                            ⏳ Próximo
  - Funcionalidades transaccionales               ⏳ Próximo
```

---

## 🏗️ Arquitectura General

```
┌──────────────────────────────────────────────────┐
│         WEB DASHBOARD (Fase 2)                   │
│    Next.js 14 + React + Recharts + Tailwind     │
│  [TelemetryChart] [CaseDetail] [Timeline] etc.  │
└──────────────────┬───────────────────────────────┘
                   │ HTTP + Header x-actor (PKI)
                   ▼
┌──────────────────────────────────────────────────┐
│         FASE 1: BACKEND BLOCKCHAIN               │
│     Ledger Distribuido Hash-Encadenado           │
│  • Proyección de Lectura (/dashboard/*)          │
│  • Transacciones (/sign, /tx/*)                  │
│  • Endorsement multi-org (multisig)              │
│  • Compatibilidad HLA                            │
│  • Validación de integridad                      │
└──────────────────┬───────────────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
┌─────────┐  ┌──────────┐  ┌──────────────┐
│ Nodo 1  │  │ Nodo 2   │  │ IoT Simulator│
│ Coord   │  │ Hospital │  │ Telemetría   │
│Nacional │  │ Donante  │  │ en vivo      │
└─────────┘  └──────────┘  └──────────────┘
```

### Componentes Principales

| Componente | Ubicación | Descripción |
|------------|-----------|-------------|
| **Backend Blockchain** | `nodes/` | Ledger distribuido, endorsement, proyección |
| **Dashboard Frontend** | `dashboard/` | UI React para visualización e interacción |
| **Simulador IoT** | `iot-simulator/` | Generador de telemetría realista |
| **Certificados PKI** | `ca/` | Autoridad de certificación (X.509) |
| **Tests de Seguridad** | `tests/` | 18 tests STRIDE (18/18 pasando) |
| **Documentación** | `docs/` | DECISIONES_DE_ALCANCE.md, specs |

---

## 🚀 Inicio Rápido

### 1. Instalación Backend

```bash
cd nodes
npm install
```

### 2. Inicio Sistema Distribuido

```bash
# Terminal 1: Coordinador Nacional
cd nodes && npm run start:coordinador-nacional

# Terminal 2: Coordinador Provincial
npm run start:coordinador-provincial

# Terminal 3: Hospital Donante
npm run start:hospital-donante

# Terminal 4: Hospital Receptor
npm run start:hospital-receptor

# Terminal 5: Simulador IoT
cd iot-simulator && npm start
```

### 3. Instalación Dashboard

```bash
cd dashboard
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

### 4. Tests

```bash
# Ejecutar todos los tests de seguridad Fase 1
cd tests
bash run-all-tests.sh

# Resultado esperado: 18/18 PASANDO
```

---

## ✅ Fase 1: Backend (COMPLETO)

### Características Implementadas

**Ledger Blockchain:**
- ✅ Hash-encadenamiento: Cada bloque contiene hash del anterior
- ✅ Append-only inmutable: Solo se agregan nuevas transacciones
- ✅ Validación de integridad: Recalcula hashes en cada lectura

**Identidad y Autenticación (PKI X.509):**
- ✅ 4 organizaciones con certificados reales: coordinador-nacional, coordinador-provincial, hospital-donante, hospital-receptor
- ✅ Firma digital RSA-2048
- ✅ Validación de certificados en cada transacción

**Endorsement (Multisig):**
- ✅ Política: Mínimo 2 firmas de orgs diferentes
- ✅ Validación de firmas antes de aceptar bloque
- ✅ Rechazo si alguna firma es inválida

**Consenso Simplificado:**
- ✅ Nodo coordinador valida y propaga via HTTP `/internal/replicate`
- ✅ Nodos receptores revalidan independientemente
- ✅ Rechazo si hash no encadena o firma no es válida

**Proyección de Lectura (Fase 1 Dashboard):**
- ✅ `GET /dashboard/casos/:id` → Estado consolidado (donante, receptor, asignación, custodia)
- ✅ `GET /dashboard/casos/:id/timeline` → Eventos ordenados con timestamp/actor/hash
- ✅ `GET /dashboard/casos/:id/telemetria` → Serie temporal telemetría (temp, humedad, GPS)
- ✅ `GET /dashboard/health` → Salud del nodo (bloques, transacciones, últimas 5)

**Compatibility HLA:**
- ✅ Query HLA: Calcula scores de compatibilidad donante-receptor
- ✅ Blood type matching: Validación ABO
- ✅ HLA matching: Compatibilidad A/B/DR

**Transacciones Soportadas:**
- ✅ `donor-registry` - Registrar donante
- ✅ `waiting-list` - Agregar paciente a lista espera
- ✅ `assignment` - Asignar órgano donante→receptor
- ✅ `custody` - Registrar telemetría IoT (temperatura, humedad, GPS)

### Tests de Seguridad (18/18 PASANDO)

```
✓ test1-basic-structure.sh           - Estructura ledger y bloques
✓ test2-hash-integrity.sh            - Validación hash-chain
✓ test3-certificate-validation.sh    - Certificados PKI válidos
✓ test4-endorsement-policy.sh        - Multisig 2+ orgs
✓ test5-invalid-signature-rejection.sh - Rechazo firmas falsas
✓ test6-consensus-replication.sh     - Propagación y validación nodos
✓ test7-immutability.sh              - No se puede modificar ledger
✓ test8-hla-matching.sh              - Compatibilidad HLA
✓ test9-blood-type-matching.sh       - Matching ABO
✓ test10-telemetria-firmada.sh       - Telemetría con firma
✓ test11-access-control.sh           - Control acceso por rol
✓ test12-replay-protection.sh        - Protección contra replay
✓ test13-concurrent-transactions.sh  - Transacciones concurrentes
✓ test14-ledger-projection.sh        - Lectura de ledger
✓ test15-case-timeline.sh            - Timeline de eventos
✓ test16-node-communication.sh       - Comunicación inter-nodos
✓ test17-audit-trail.sh              - Auditoría y trazabilidad
✓ test18-edge-cases.sh               - Casos edge (valores nulos, etc)
```

---

## 🎨 Fase 2: Dashboard (EN PROGRESO)

### Estado Actual (Fase 2a - COMPLETO)

**Componentes Core Implementados:**

1. **TelemetryChart.tsx** (380 líneas)
   - Gráficos Recharts: Área (temperatura) + Línea (humedad)
   - Estadísticas: Min/Max/Promedio + Alertas
   - Tabla últimas 10 lecturas
   - Color-coding por estado

2. **CaseDetail.tsx** (330 líneas)
   - Vista consolidada: Donante/Receptor/Asignación
   - Custodia summary con estadísticas telemetría
   - Reuso de helpers → Sin duplicación

3. **Timeline.tsx** (280 líneas)
   - Línea temporal de eventos cronológica
   - Tipos: donor-registry, waiting-list, assignment, custody
   - Timestamp, actores, hash, payload summary

4. **Helpers Compartidos** (telemetry-utils.ts)
   - `calculateTelemetryStats()` - Min/max/promedio
   - `formatTemp()`, `formatHumidity()` - Formateo consistente
   - `getAlertReadings()`, `isWithinSafeRange()`

5. **API Client** (api-client.ts)
   - Todos endpoints Fase 1
   - Routing automático por rol (puertos 3001-3004)
   - Sign + Submit workflow

6. **Dev Fixtures** (dev-fixtures.ts)
   - `demo-dev-donor-001`, `demo-dev-patient-001`
   - Schema REAL del iot-simulator (temperaturaC, humedadPct, gps)
   - `generateTelemetryReading()` para testing

**Documentación Enriquecida:**
- ✅ dashboard/README.md (completo con ejemplos)
- ✅ docs/DECISIONES_DE_ALCANCE.md (§8, §9, §10 actualizados)
- ✅ Arquitectura y esquemas documentados

### Próximas Fases (2b+)

#### Fase 2b: Dashboards por Rol
- [ ] **Coordinador Nacional**: Listar casos, crear asignaciones, health grid
- [ ] **Coordinador Provincial**: Validar/endorsar transacciones
- [ ] **Hospital Donante**: Registrar donantes, co-firmar
- [ ] **Hospital Receptor**: Ver asignados, confirmar recepción
- [ ] **Auditor**: Query multi-nodo, auditoría
- [ ] **IoT**: Solo lectura telemetría

#### Fase 2c: Páginas Dinámicas
- [ ] `/dashboard/casos/[id]` - Caso individual
- [ ] `/dashboard/casos` - Listado de casos
- [ ] `/dashboard/asignaciones` - Crear nueva asignación

#### Fase 2d: Funcionalidades Transaccionales
- [ ] Formularios: registro, asignación, confirmación
- [ ] Integración firma digital
- [ ] Tabla de honestidad/transparencia
- [ ] Dashboard auditoría

---

## 📝 Decisiones de Alcance (Simplificaciones del Prototipo)

Ver **docs/DECISIONES_DE_ALCANCE.md** para detalles completos.

### Resumen

| Aspecto | Prototipo | Producción (Hyperledger Fabric) |
|---------|-----------|--------------------------------|
| **Ledger** | Implementado desde cero | Fabric real |
| **Criptografía** | RSA-2048 | ECDSA P-256 |
| **Consenso** | Validación independiente (no Raft) | Raft/BFT |
| **Interface** | API REST | Fabric Gateway |
| **Telemetría** | Inyección manual demo | Stream IoT real |
| **Infraestructura** | Nodos locales Docker | Fabric network completa |

**Justificación:** Construir desde cero demuestra comprensión completa de cada control de seguridad, no solo configuración de herramientas.

---

## 🎯 Convención de Datos para Testing

```
Fase 1 Tests (Seguridad):     test-donor-001, test-organ-xyz
Fase 2 Desarrollo:            demo-dev-donor-001, demo-dev-patient-001 ✓
Demo Final para Jurado:       demo-pitch-donor-001, demo-pitch-patient-001 (read-only)
Auditoría/Concurrencia:       donor-audit-*, donor-concurrent-*
```

**Regla:** Usar prefijos para auditoría y replicabilidad.

---

## 📂 Estructura del Repositorio

```
INTEGRAlab/
├── nodes/                          # Backend Fase 1
│   ├── server.js                   # Servidores de cada nodo (4 orgs)
│   ├── lib/
│   │   ├── ledger.js              # Implementación ledger blockchain
│   │   ├── endorsement.js         # Validación multisig
│   │   ├── dashboard-projection.js # Endpoints lectura proyección
│   │   └── hla-compatibility.js   # Cálculo compatibilidad HLA
│   └── certs/                      # Certificados X.509 por org
│
├── dashboard/                      # Frontend Fase 2
│   ├── app/                        # Next.js app router
│   ├── components/
│   │   ├── TelemetryChart.tsx
│   │   ├── CaseDetail.tsx
│   │   ├── Timeline.tsx
│   │   └── ui/                     # shadcn/ui components
│   ├── lib/
│   │   ├── api-client.ts           # HTTP client
│   │   ├── telemetry-utils.ts      # Helpers compartidos
│   │   ├── dev-fixtures.ts         # Datos prueba
│   │   └── types.ts                # TypeScript interfaces
│   └── README.md                   # Documentación dashboard
│
├── iot-simulator/                  # Simulador IoT
│   └── simulate.js                 # Generador telemetría realista
│
├── ca/                             # Autoridad Certificación
│   └── generate-ca-hierarchy.js    # Generador certificados PKI
│
├── tests/                          # Test suite Fase 1
│   ├── test1-basic-structure.sh
│   ├── test2-hash-integrity.sh
│   └── ... (18 tests STRIDE model)
│
├── docs/
│   └── DECISIONES_DE_ALCANCE.md    # Justificaciones técnicas
│
└── README.md                       # Este archivo
```

---

## 🛠️ Stack Tecnológico

### Backend
- **Node.js 18+** - Runtime
- **Express.js** - HTTP server
- **node-forge** - PKI/Certificados
- **Crypto** - Hash SHA-256

### Frontend
- **Next.js 14** - React framework
- **React 18** - UI library
- **TypeScript 5** - Type safety
- **Tailwind CSS** - Styling
- **Recharts 2.10** - Gráficos
- **shadcn/ui** - Componentes accesibles
- **Axios** - HTTP client
- **lucide-react** - Iconos

### Testing & Deployment
- **Docker Compose** - Orquestación local
- **Bash scripts** - Test automation

---

## 📊 Métricas de Calidad

### Seguridad
- ✅ 18/18 tests STRIDE pasando
- ✅ No vulnerabilidades OWASP Top 10 identificadas
- ✅ Validación criptográfica en cada transacción
- ✅ Control de acceso basado en PKI

### Arquitectura
- ✅ Separación clara: Backend (ledger) ↔ Frontend (UI)
- ✅ Sin duplicación de lógica (helpers compartidos)
- ✅ Tipos TypeScript 100% coherentes con API
- ✅ Schema telemetría consistente end-to-end

### Documentación
- ✅ README.md en cada módulo (dashboard/, nodes/)
- ✅ Decisiones técnicas documentadas (DECISIONES_DE_ALCANCE.md)
- ✅ Comentarios en código crítico
- ✅ Ejemplos de uso en fixtures

---

## 🐛 Ejecutar Pruebas

### Test Individual Fase 1

```bash
cd tests/dashboard
bash test-dashboard-endpoints.sh

# Resultado esperado: GET/POST a /dashboard/*, /sign, /tx/assignment funcionan
```

### Test Completo 18/18

```bash
cd tests
bash run-all-tests.sh

# Resultado esperado:
# TOTAL: 18/18 PASSING
```

### Test Dashboard Manual

```bash
# 1. Iniciar backend (ver "Inicio Rápido" arriba)
# 2. Iniciar dashboard: cd dashboard && npm run dev
# 3. Ir a http://localhost:3000
# 4. Selector rol → cambiar de rol
# 5. Verificar que endpoints se llamar correctamente
```

---

## 📞 Contacto & Colaboración

Proyecto académico para Concurso de Innovación Tecnológica 2025.

**Objetivos de Replicación:**
- Brasil: Sistema SNT (Serviço Nacional de Transplantes)
- México: Sistema CENATRA (Centro Nacional de Trasplante)
- Proteja datos sensibles (HLA, GPS) con blockchain distribuido

---

## 📄 Licencia

Proyecto de investigación académica. Ver LICENSE para detalles.

---

**Última actualización:** 2026-08-27
**Versión:** 2.0 (Fase 2a - Core Dashboard)
**Estado de Tests:** 18/18 PASANDO ✓
