# 🏥 INTEGRAlab

**Sistema de Coordinación Distribuida de Trasplantes de Órganos con Blockchain**

Prototipo completo que implementa un ledger blockchain personalizado para coordinación segura de trasplantes de órganos entre hospitales, con telemetría en tiempo real, PKI X.509 y verificación de compatibilidad HLA.

---

## 🎬 Presentación del Proyecto

📺 **Mira la presentación completa:** [https://video-wciso-integra.vercel.app/](https://video-wciso-integra.vercel.app/)

---

## 📊 Estado General del Proyecto

**✅ Completitud: 100%**

```
Fase 1: Backend Blockchain + Endpoints de Lectura     ✅ COMPLETO (18/18 tests)
Fase 2: Dashboard Frontend                             ✅ COMPLETO (100% funcional)
Fase 3: Validación End-to-End                         ✅ COMPLETO
Containerización + Documentación                       ✅ COMPLETO
```

**Verificado:** El sistema levanta de cero sin pasos manuales no documentados. Listo para demostración.

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

## 🚀 Inicio Rápido (5 minutos)

### Opción 1: Docker Compose (Recomendado)

```bash
# 1. Limpiar estado anterior (primera vez)
./scripts/reset.sh --force --with-certs

# 2. Levantar TODO (Backend + Dashboard + IoT)
docker compose up --build

# 3. En nueva terminal: inyectar datos de prueba
bash scripts/setup-demo-pitch-data.sh

# 4. Abrir dashboard
http://localhost:3000/dashboard
# Buscar: demo-pitch-donor-001
```

### Opción 2: Manual (Terminales separadas)

```bash
# Terminal 1: Coordinador Nacional
cd nodes && npm install && npm run start:coordinador-nacional

# Terminal 2-4: Otros nodos
npm run start:coordinador-provincial
npm run start:hospital-donante
npm run start:hospital-receptor

# Terminal 5: IoT Simulator
cd iot-simulator && npm start

# Terminal 6: Dashboard
cd dashboard && npm install && npm run dev
# → http://localhost:3000
```

---

## 📚 Documentación Completa

### Guía de Uso

| Documento | Contenido | Audiencia |
|-----------|-----------|-----------|
| **[PASO_A_PASO_DETALLADO.md](./PASO_A_PASO_DETALLADO.md)** | Explicación arquitectura con ejemplos visuales (600+ líneas) | **Comienza aquí** |
| **[GUIA_TEST_COMPLETO.md](./GUIA_TEST_COMPLETO.md)** | Testing step-by-step, valores óptimos, troubleshooting | Desarrolladores |
| **[RESUMEN31-8.md](./RESUMEN31-8.md)** | Diagnóstico completo: estado, completitud, checklist | Project managers |

### Fundamentación del Proyecto

| PDF | Tema |
|-----|------|
| **[INTEGRA_Historia_Usuario.pdf](./docs/fundamentacion/INTEGRA_Historia_Usuario.pdf)** | Casos de uso, necesidades clínicas |
| **[INTEGRA_Paso1_Amenazas.pdf](./docs/fundamentacion/INTEGRA_Paso1_Amenazas.pdf)** | Análisis STRIDE, amenazas de seguridad |
| **[INTEGRA_Paso2_Arquitectura.pdf](./docs/fundamentacion/INTEGRA_Paso2_Arquitectura.pdf)** | Diseño de sistema, blockchain, PKI, HLA |
| **[INTEGRA_Paso3_Implementacion.pdf](./docs/fundamentacion/INTEGRA_Paso3_Implementacion.pdf)** | Detalles de implementación, algoritmos |
| **[INTEGRA_Glosario.pdf](./docs/fundamentacion/INTEGRA_Glosario.pdf)** | Términos técnicos y clínicos |

### Decisiones Arquitectónicas

- **[docs/DECISIONES_DE_ALCANCE.md](./docs/DECISIONES_DE_ALCANCE.md)** — 10 decisiones explícitas de simplificación con justificación

---

## ⚙️ Configuración y Mantenimiento

### Primer Setup

```bash
# Limpiar TODO e inicializar
./scripts/reset.sh --force --with-certs
docker compose up --build
```

### Entre Sesiones

```bash
# Mantener datos, solo reiniciar contenedores
docker compose up --build

# O limpiar datos (mantener certificados)
./scripts/reset.sh --force
docker compose up --build
```

### Certificados PKI (TTL: 72 horas)

Si pasaron más de 3 días, regenerar:

```bash
./scripts/reset.sh --force --with-certs
docker compose up --build
```



---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────┐
│         WEB DASHBOARD (http://localhost:3000)      │
│    Next.js 14 + React + Recharts + Tailwind        │
│  [RoleSelector] [CaseDetail] [Timeline]            │
│  [TelemetryChart] [IntegrityCheck] [Estadísticas]  │
└─────────────────┬───────────────────────────────────┘
                  │ HTTP GET (solo lectura)
                  │ Header: x-actor (PKI)
                  ▼
┌─────────────────────────────────────────────────────┐
│         BLOCKCHAIN BACKEND (Puertos 3001-3004)    │
│      Ledger Distribuido Hash-Encadenado            │
│  • 4 Nodos (Coord Nac, Coord Prov, Hosp D/R)      │
│  • PKI X.509 + RSA-2048 (Firma digital)            │
│  • Endorsement Multisig (2+ orgs)                  │
│  • Proyección de lectura (/dashboard/*)            │
│  • Verificación HLA + Compatibilidad               │
└─────────────────┬───────────────────────────────────┘
                  │
     ┌────────────┼────────────┐
     ▼            ▼            ▼
  IoT Simulator   Ledger    Replicación
  (telemetría)   (JSON)    (HTTP)
  (3000-5s)    (./data/)   (internodos)
```

### Componentes

| Componente | Ubicación | Puerto | Qué Hace |
|-----------|-----------|--------|----------|
| **Blockchain Nodes** | `nodes/` | 3001-3004 | Ledger, validación, PKI, endorsement |
| **Dashboard** | `dashboard/` | 3000 | UI Next.js, consulta casos, estadísticas |
| **IoT Simulator** | `iot-simulator/` | — | Telemetría cada 5s (firmada) |
| **CA Setup** | `ca/` | — | Genera PKI X.509 al iniciar |

---

## ✅ Características Implementadas

### Blockchain (Fase 1)

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

### Dashboard (Fase 2)

✅ **Completado 100%:**
- **RoleSelector** — Cambiar org consultada (5 roles)
- **CaseDetail** — Visualización donante, receptor, asignación
- **TelemetryChart** — Gráfico temperatura/humedad en tiempo real
- **Timeline** — Eventos cronológicos con hash y firmas
- **IntegrityCheck** — Verificación hash-chain (auto-refresca 10s)
- **Estadísticas** — Gráficos de tx por tipo, últimas transacciones
- **Panel /infra** — Monitoreo de nodos, quorum, consistencia

**Rutas:**
- `/` — Puerta (infra vs consulta)
- `/infra` — Diagnóstico de nodos
- `/dashboard` — Inicio con verificación de integridad
- `/dashboard/casos/[id]` — Detalle de caso (donante + receptor + asignación + telemetría)
- `/dashboard/estadisticas` — Estadísticas del ledger

---

## 🧪 Testing

### Seguridad (18/18 PASS)

Todos los tests STRIDE implementados y pasando:

```
✅ Estructura y validación (test1-3)
✅ Endorsement y PKI (test4-6)
✅ Consenso y replicación (test7, test16)
✅ Compatibilidad HLA (test8-9)
✅ Telemetría y auditoría (test10, test17)
✅ Control de acceso y protección (test11-12)
✅ Concurrencia y edge cases (test13, test18)
✅ Proyección y timeline (test14-15)
```

Ejecutar tests:
```bash
cd nodes && npm run test:seguridad
```

### E2E (Scripts de Validación)

- `scripts/setup-demo-pitch-data.sh` — Inyecta caso completo de demostración
- `tests/e2e-role-switching-validation.sh` — Valida cambio de roles en UI
- `tests/dashboard/test-dashboard-endpoints.sh` — Valida endpoints de proyección

---

## 🐋 Deployment

### Docker Compose (Recomendado)

Levanta TODO automáticamente:
```bash
docker compose up --build
```

Contenedores:
- `ca-setup` — Genera PKI (se detiene después de completar)
- `coordinador-nacional` — Nodo orderer (puerto 3001)
- `coordinador-provincial` — Nodo (puerto 3002)
- `hospital-donante` — Nodo (puerto 3003)
- `hospital-receptor` — Nodo (puerto 3004)
- `iot-simulator` — Telemetría (sin puerto expuesto)
- `dashboard` — UI React (puerto 3000)

### Logs en Vivo

```bash
docker compose logs -f  # todos
docker compose logs -f coordinador-nacional  # nodo específico
docker compose logs -f dashboard  # UI
```

### Reset Estado

```bash
# Opción 1: Limpiar data, mantener certs
./scripts/reset.sh --force

# Opción 2: Limpiar TODO (certs se regeneran)
./scripts/reset.sh --force --with-certs

# Opción 3: Usar docker directamente
docker compose down -v
```

---

## 📊 Datos de Prueba

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

## 📄 Licencia

Proyecto de investigación académica. Ver LICENSE para detalles.

---

**Última actualización:** 2026-08-27
**Versión:** 2.0 (Fase 2a - Core Dashboard)
**Estado de Tests:** 18/18 PASANDO ✓
