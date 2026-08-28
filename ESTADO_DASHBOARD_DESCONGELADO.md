# DASHBOARD DESCONGELADO — ESTADO ACTUAL

**Fecha**: 2026-08-28  
**Evento**: Dashboard reanudado después que Fase 1 (blockchain) quedó estable  
**Estado**: ✅ Operativo, conectando a backend con Orderer

---

## ✅ VALIDACIÓN END-TO-END

### Backend
- ✔ 4 nodos corriendo (docker compose)
- ✔ Orderer único (coordinador-nacional) estable
- ✔ 50 bloques en ledger (del PASO 3)
- ✔ Quorum funcionando (3/4 votos)

### Dashboard
- ✔ Next.js 14 iniciado en puerto 3000
- ✔ UI cargada (componentes React compilados)
- ✔ Conectado a backend en puerto 3001
- ✔ Headers `x-actor` correctamente enviados
- ✔ Endpoints `/dashboard/*` respondiendo

### Flujo E2E
```
Frontend (3000) → Backend (3001)
  GET /dashboard/health → 50 bloques ✓
  GET /ledger → Acceso autorizado ✓
  GET /dashboard/casos/demo-dev-donor-001 → Caso existe ✓
```

---

## 📊 COMPONENTES OPERATIVOS

### Implementados (Fase 2a)
| Componente | Líneas | Status |
|------------|--------|--------|
| **TelemetryChart.tsx** | 380 | ✓ Recharts + Stats |
| **CaseDetail.tsx** | 330 | ✓ Donante/Receptor/Custodia |
| **Timeline.tsx** | 280 | ✓ Eventos cronológicos |
| **RoleSelector.tsx** | — | ✓ Cambio dinámico de rol |
| **telemetry-utils.ts** | 150 | ✓ Helpers compartidos |
| **api-client.ts** | 500+ | ✓ Todos endpoints |
| **dev-fixtures.ts** | 150 | ✓ Demo data |

### Stack Tecnológico
- **Framework**: Next.js 14 + React 18 + TypeScript 5
- **Styling**: Tailwind CSS 3.3 + shadcn/ui
- **Charts**: Recharts 2.10
- **HTTP**: Axios con routing por rol

---

## 🎯 PENDIENTE (Fase 2b+)

### Crítico
- [ ] Dashboard por rol: 6 vistas especializadas
  - [ ] Coordinador Nacional: Listar casos, crear asignaciones
  - [ ] Coordinador Provincial: Endorsar transacciones
  - [ ] Hospital Donante: Registrar donantes
  - [ ] Hospital Receptor: Ver asignados, confirmar
  - [ ] Auditor: Query multi-nodo
  - [ ] IoT: Solo lectura telemetría

### Páginas Dinámicas
- [ ] `/dashboard/casos/[id]` — Detalle individual
- [ ] `/dashboard/casos` — Listado completo
- [ ] `/dashboard/asignaciones` — Crear asignación
- [ ] `/dashboard/auditoría` — Auditor multi-nodo

### Funcionalidades
- [ ] Formularios: registro, asignación, confirmación
- [ ] Tabla de transparencia/honestidad
- [ ] Tests end-to-end (Cypress)
- [ ] Gráficos avanzados (timeline interactivo)

---

## 🔄 CÓMO CONTINUAR

### Próxima Sesión: Fase 2b
```bash
cd dashboard
npm run dev  # Already running on port 3000

# El backend sigue en:
docker compose up  # Puertos 3001-3004

# Actualizar fixtures con datos reales del orderer
npm run dev  # Hace hot-reload
```

### Pasos Recomendados
1. **Crear página de listado** `/app/casos/page.tsx`
   - Consumir `getCasesList()` del api-client
   - Mostrar tabla con columna donante, receptor, estado

2. **Crear página de detalle** `/app/casos/[id]/page.tsx`
   - Usar `CaseDetail.tsx` y `Timeline.tsx` existentes
   - Agregar botones de acción por rol

3. **Agregar role-based UI**
   - Hospital Donante: Ver "Registrar nuevo donante"
   - Coordinador: Ver "Crear asignación"
   - Auditor: Ver "Query multi-nodo"

4. **Testing**
   - Abrir http://localhost:3000 en navegador
   - Cambiar rol con selector en header
   - Verificar que el puerto del nodo cambia automáticamente

---

## 📝 DOCUMENTACIÓN RELACIONADA

| Documento | Propósito |
|-----------|-----------|
| **dashboard/README.md** | Guía de componentes y desarrollo |
| **DECISIONES_DE_ALCANCE.md § 8** | Convención nombres data (demo-dev-*) |
| **nodes/lib/dashboard-projection.js** | Proyección de datos (Fase 1) |
| **iot-simulator/simulate.js** | Schema real de telemetría |

---

## 🚀 CRITERIOS DE ÉXITO (Fase 2b)

- [ ] 3 nuevas páginas operativas
- [ ] Role-based UI funciona (cambio de rol → cambio de UI)
- [ ] Formularios para crear casos (donor-registry)
- [ ] Gráficos de telemetría interactivos
- [ ] Tests e2e pasando
- [ ] 0 errores de consola en navegador

---

## 📌 NOTAS TÉCNICAS

### API Client Routing
```typescript
// Automático por rol
const client = getAPIClient('coordinador-nacional')  // → 3001
const client = getAPIClient('hospital-donante')      // → 3003
```

### Fixtures (demo-dev-*)
```typescript
DEV_DONOR_ID = 'demo-dev-donor-001'
DEV_PATIENT_ID = 'demo-dev-patient-001'

// Telemetría con schema REAL del iot-simulator
{
  deviceId: 'sensor-contenedor-001',
  temperaturaC: 2.5,    // ← REAL (no sensorType/value/unit)
  humedadPct: 45.3,
  gps: { lat, lon },
  fueraDeRango: false
}
```

### Helpers Compartidos
```typescript
import { calculateTelemetryStats, formatTemp } from '@/lib/telemetry-utils'

const stats = calculateTelemetryStats(telemetry)  // No duplicar lógica
```

---

## 🔐 Seguridad

- ✅ Headers `x-actor` enviados en cada request
- ✅ Endpoints `/internal/*` protegidos (no accesibles desde frontend)
- ✅ Certificados PKI validados en backend
- ✅ CORS configurado correctamente

---

**Estado**: Dashboard Fase 2a completo, Fase 2b pendiente  
**Próxima**: Crear páginas dinámicas y role-based UI  
**Tiempo estimado**: 2-3 sesiones para completar Fase 2b

---

**Generado por**: Claude Code - Sesión 2026-08-28
