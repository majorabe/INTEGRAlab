# INTEGRAlab Dashboard - Fase 2

Interfaz visual interactiva para el sistema de coordinación de trasplantes de órganos basado en blockchain.

## 📋 Tabla de Contenidos

- [Visión General](#visión-general)
- [Arquitectura](#arquitectura)
- [Componentes Implementados](#componentes-implementados)
- [Cómo Empezar](#cómo-empezar)
- [Estado del Proyecto](#estado-del-proyecto)
- [Guía de Desarrollo](#guía-de-desarrollo)

---

## 🎯 Visión General

**Dashboard Fase 2** es la interfaz web del sistema INTEGRAlab que:

1. **Consume endpoints de Fase 1** (`/dashboard/*`) para lectura de casos, timeline y telemetría
2. **Integra transacciones blockchain** mediante signature + submit workflow
3. **Soporta 6 roles organizacionales** con permisos basados en certificados PKI reales
4. **Visualiza datos en tiempo real** con gráficos Recharts, tablas interactivas y timeline de eventos
5. **Sin duplicación de lógica** mediante utilidades compartidas (telemetry-utils.ts)

### Tecnología Stack

```
Frontend:      Next.js 14 + React 18 + TypeScript 5
Styling:       Tailwind CSS 3.3 + shadcn/ui components
Visualización: Recharts 2.10 (gráficos de series temporales)
HTTP Client:   Axios 1.6 con auto-routing por rol
```

---

## 🏗️ Arquitectura

### Capas

```
┌─────────────────────────────────────────┐
│   Componentes React (TelemetryChart,    │
│   CaseDetail, Timeline, RoleSelector)   │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│  Utilities (telemetry-utils.ts)         │
│  - calculateTelemetryStats()            │
│  - formatTemp(), formatHumidity()       │
│  - getAlertReadings()                   │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│  API Client (lib/api-client.ts)         │
│  - getCaseState, getCaseTimeline        │
│  - getCaseTelemetry, getNodeHealth      │
│  - signPayload, submitTransaction       │
│  - queryCompatibility                   │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│  Fase 1 Backend (nodes/server.js)       │
│  Endpoints: /dashboard/*, /sign, /tx    │
│  Authentication: Header x-actor (PKI)   │
└─────────────────────────────────────────┘
```

### Flujo de Datos

```
Real IoT Simulator
    ↓
iot-simulator/simulate.js (schema real: temperaturaC, humedadPct, gps)
    ↓
nodes/lib/dashboard-projection.js (extractTelemetrySeries)
    ↓
GET /dashboard/casos/:id/telemetria (Fase 1 endpoint)
    ↓
lib/api-client.ts getCaseTelemetry()
    ↓
lib/telemetry-utils.ts calculateTelemetryStats() [SHARED]
    ↓
Componentes: TelemetryChart, CaseDetail
```

### Roles y Permisos

| Rol | Puertos | Permisos | Estado |
|-----|---------|----------|--------|
| **coordinador-nacional** | 3001 | Listar casos, crear asignaciones, ver health | ⏳ |
| **coordinador-provincial** | 3002 | Validar/endorsar, ver casos provincia | ⏳ |
| **hospital-donante** | 3003 | Registrar donantes, co-firmar asignaciones | ⏳ |
| **hospital-receptor** | 3004 | Ver casos asignados, confirmar recepción | ⏳ |
| **iot** | N/A | Solo lectura: /dashboard/casos/:id/telemetria | ⏳ |

---

## ✅ Componentes Implementados

### 1. **TelemetryChart.tsx** (380 líneas)

Visualización de serie temporal de custodia (temperatura/humedad) durante transporte del órgano.

**Funcionalidades:**
- Gráfico Recharts: Área para temperatura, Línea para humedad
- Estadísticas calculadas: Min/Max/Promedio (usando helper compartido)
- Alerta banner si hay lecturas fuera de rango (fueraDeRango=true)
- Tabla de últimas 10 lecturas con color-coding por estado
- Empty state cuando no hay datos

**Props:**
```typescript
interface TelemetryChartProps {
  data: TelemetryReading[]
  title?: string
  description?: string
}
```

---

### 2. **CaseDetail.tsx** (330 líneas)

Vista consolidada de un caso de trasplante con información de donante, receptor y custodia.

**Secciones:**
- **Donante**: ID, tipo sangre, HLA profile, tipo órgano, método preservación
- **Receptor**: ID, tipo sangre, HLA profile, urgencia, fecha registro
- **Asignación**: Donante→Receptor mapping, órgano, HLA score
- **Custodia**: Estadísticas telemetría + Alert banner
- **Transacciones**: Total y fecha última actualización

**Reutilización de Lógica:**
```typescript
// ✓ No duplica: usa calculateTelemetryStats() del helper compartido
const telemetryStats = calculateTelemetryStats(telemetry)
```

---

### 3. **Timeline.tsx** (280 líneas)

Línea de tiempo cronológica de eventos del caso.

**Tipos de Eventos:**
- `donor-registry`: Donante registrado ❤️ (rojo)
- `waiting-list`: Paciente en lista espera 🏥 (azul)
- `assignment`: Órgano asignado ✓ (verde)
- `custody`: Telemetría registrada ⚡ (ámbar)

**Para Cada Evento Muestra:**
- Timestamp y "hace X tiempo"
- Actores que firmaron
- Hash transaccional (con tooltip)
- Payload summary

---

### 4. **lib/telemetry-utils.ts** (Shared Helpers)

Utilidades reutilizables para cálculos de telemetría sin duplicación.

**Función Principal:**
```typescript
function calculateTelemetryStats(readings: TelemetryReading[]): TelemetryStats {
  return {
    minTemp: Math.min(...temps),
    maxTemp: Math.max(...temps),
    avgTemp: avg.toFixed(1),
    avgHumidity: avgHum.toFixed(1),
    alertCount: readings.filter(r => r.fueraDeRango).length,
    totalReadings: readings.length
  }
}
```

**Funciones Auxiliares:**
- `getAlertReadings()` - Filtra solo fuera de rango
- `formatTemp()` - Retorna "2.5°C"
- `formatHumidity()` - Retorna "45.3%"
- `isWithinSafeRange()` - Valida 0-4°C

---

### 5. **lib/api-client.ts** (500+ líneas)

Cliente HTTP que encapsula todos los endpoints de Fase 1.

**Métodos de Lectura:**
```typescript
getCaseState(caseId: string)
getCaseTimeline(caseId: string)
getCaseTelemetry(caseId: string)
getNodeHealth()
queryCompatibility(donorProfile, waitingList)
```

**Métodos de Escritura:**
```typescript
signPayload(payload: any)
submitTransaction(txType, payload, signatures)
executeTransaction(txType, payload)  // Workflow completo
```

**Routing por Rol:**
```typescript
const client = getAPIClient('coordinador-nacional') // → puerto 3001
const client = getAPIClient('hospital-donante')      // → puerto 3003
```

---

### 6. **lib/dev-fixtures.ts** (Datos de Prueba)

Datos usando convención `demo-dev-*` con schema real del iot-simulator.

**Identificadores:**
```typescript
DEV_DONOR_ID = 'demo-dev-donor-001'
DEV_PATIENT_ID = 'demo-dev-patient-001'
```

**Telemetría (Schema REAL):**
```typescript
{
  deviceId: 'sensor-contenedor-001',
  organo: 'rinon',
  temperaturaC: 2.5,      // ← REAL (no usar sensorType/value/unit)
  humedadPct: 45.3,       // ← REAL
  gps: { lat, lon },
  fueraDeRango: false,
  organId: 'demo-dev-donor-001'  // ← Agregado solo para demo
}
```

---

## 🚀 Cómo Empezar

### Instalación

```bash
cd dashboard
npm install
```

### Desarrollo Local

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

### Build

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```

---

## 📊 Estado del Proyecto

### ✅ Completado (Fase 2a)

| Componente | Líneas | Estado |
|------------|--------|--------|
| TelemetryChart.tsx | 380 | ✓ Gráficos + Estadísticas |
| CaseDetail.tsx | 330 | ✓ Donante/Receptor/Custodia |
| Timeline.tsx | 280 | ✓ Eventos cronológicos |
| telemetry-utils.ts | 150 | ✓ Helpers compartidos |
| api-client.ts | 500+ | ✓ Todos endpoints |
| dev-fixtures.ts | 150 | ✓ demo-dev-* data |

### ⏳ Pendiente (Fase 2b+)

#### Dashboards por Rol (CRÍTICO)
- [ ] Coordinador Nacional: Listar, crear asignaciones
- [ ] Coordinador Provincial: Endorsar transacciones
- [ ] Hospital Donante: Registrar donantes
- [ ] Hospital Receptor: Ver asignados, confirmar
- [ ] IoT: Solo lectura telemetría

#### Páginas Dinámicas
- [ ] `/dashboard/casos/[id]` - Caso individual
- [ ] `/dashboard/casos` - Listado
- [ ] `/dashboard/asignaciones` - Crear asignación

#### Funcionalidades
- [ ] Formularios: registro, asignación, confirmación
- [ ] Tabla de honestidad/transparencia
- [ ] Tests end-to-end

---

## 🛠️ Guía de Desarrollo

### ✅ Usar Helpers Compartidos

```tsx
// CORRECTO
import { calculateTelemetryStats, formatTemp } from '@/lib/telemetry-utils'
const stats = calculateTelemetryStats(telemetry)

// ❌ EVITAR: Duplicar lógica de cálculos
```

### ✅ Consumir API

```tsx
import { getAPIClient } from '@/lib/api-client'

const client = getAPIClient()
const caseData = await client.getCaseState(caseId)
const telemetry = await client.getCaseTelemetry(caseId)
```

### ✅ Usar Fixtures para Testing

```tsx
import { devDonorPayload, generateTelemetryReading } from '@/lib/dev-fixtures'

const telemetry = Array.from({ length: 10 }, (_, i) =>
  generateTelemetryReading(DEV_DONOR_ID, 2.5, i + 1)
)
```

### Convención de Nombres

```
Fase 1 Tests:        test-donor-001
Fase 2 Desarrollo:   demo-dev-donor-001 ✓
Demo Final:          demo-pitch-donor-001 (read-only)
```

---

## 📝 Documentación Relacionada

- **docs/DECISIONES_DE_ALCANCE.md**:
  - §8: Convención nombres data
  - §9: Vinculación por organId
  - §10: Telemetría arquitectura
- **nodes/lib/dashboard-projection.js**: Capa proyección (Fase 1)
- **iot-simulator/simulate.js**: Schema real telemetría

---

## 🐛 Debugging

```bash
# Ver respuesta API
curl -H "x-actor: coordinador-nacional" \
  http://localhost:3001/dashboard/casos/demo-dev-donor-001

# Ver ledger
curl http://localhost:3001/ledger
```

---

**Última actualización:** 2026-08-27
**Versión:** 2.0 (Fase 2 - Componentes Core)
