# 🏥 INTEGRAlab

Infraestructura de Trazabilidad e Identidad para la Gestión de Recursos de Asignación

Prototipo completo: ledger blockchain personalizado + PKI X.509 + telemetría en tiempo real + compatibilidad HLA.
**4 nodos distribuidos, 20+ tests de seguridad, dashboard interactivo.**

---

## 📺 Video de Presentación

**Ver demostración completa:** [https://video-wciso-integra.vercel.app/](https://video-wciso-integra.vercel.app/)

---

## 🚀 Quick Start (5 minutos)

```bash
# 1. Limpiar
./scripts/reset.sh --force

# 2. Levantar red (4 nodos + dashboard)
docker compose up --build -d

# 3. Verificar que esté listo
curl -s http://localhost:3001/health | jq '.ledgerHeight'

# 4. Crear caso de demostración + trazabilidad IoT
bash scripts/setup-demo-pitch-data.sh

# 5. Ver en navegador
# Dashboard: http://localhost:3000/dashboard
# Infraestructura: http://localhost:3000/infra
```

⚠️ **Para detalles paso a paso:** Ver `[PASOS_DETALLADOS.md](./PASOS_DETALLADOS.md)`

---

## 📸 Pantallas del Proyecto

### Dashboard — Visualización de Casos Clínicos

<div align="center">
  <img src="./pantallas/panel_dashboard1.jpg" alt="Dashboard Principal" width="700">
</div>

Panel principal con datos consolidados del donante, receptor y estado de asignación. Muestra en tiempo real el avance del caso clínico.

---



## 📑 Índice de Documentación



### 🎯 Por Caso de Uso


| Quiero...                   | Documento                                          | Tiempo |
| --------------------------- | -------------------------------------------------- | ------ |
| Ver cómo funciona           | [PASOS_DETALLADOS.md](./PASOS_DETALLADOS.md)       | 15 min |
| Probar ataques de seguridad | [PASOS_DE_ATAQUES.md](./PASOS_DE_ATAQUES.md)       | 10 min |
| Ejecutar script de ataques  | [GUIA_DE_USO_ATAQUES.md](./GUIA_DE_USO_ATAQUES.md) | 5 min  |
| Entender tests              | [DIAGNOSTICO_TESTS.md](./DIAGNOSTICO_TESTS.md)     | 10 min |
| Troubleshoot problemas      | [GUIA_TEST_COMPLETO.md](./GUIA_TEST_COMPLETO.md)   | 20 min |




### 📚 Fundamentación del Proyecto

**PDFs académicos** — `docs/fundamentacion/`


| Tema                                 | Archivo                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Historia de usuario (casos clínicos) | `[INTEGRA_Historia_Usuario.pdf](./docs/fundamentacion/INTEGRA_Historia_Usuario.pdf)`         |
| Análisis STRIDE (amenazas)           | `[INTEGRA_Paso1_Amenazas.pdf](./docs/fundamentacion/INTEGRA_Paso1_Amenazas.pdf)`             |
| Diseño arquitectónico                | `[INTEGRA_Paso2_Arquitectura.pdf](./docs/fundamentacion/INTEGRA_Paso2_Arquitectura.pdf)`     |
| Detalles de implementación           | `[INTEGRA_Paso3_Implementacion.pdf](./docs/fundamentacion/INTEGRA_Paso3_Implementacion.pdf)` |
| Glosario técnico                     | `[INTEGRA_Glosario.pdf](./docs/fundamentacion/INTEGRA_Glosario.pdf)`                         |




### 🏗️ Decisiones Técnicas

**Documento único:** `[docs/DECISIONES_DE_ALCANCE.md](./docs/DECISIONES_DE_ALCANCE.md)`

Explica 10 decisiones de simplificación prototipo vs. producción (Hyperledger Fabric).

---



## 🎮 Simular Ataques de Seguridad

Verifica que el sistema rechace intentos maliciosos:

```bash
# Spoofing: Cert autofirmado
bash scripts/setup-demo-attack-scenarios.sh a1

# Tampering: Firma modificada
bash scripts/setup-demo-attack-scenarios.sh a3

# Endorsement incompleto (1 firma, necesita 2)
bash scripts/setup-demo-attack-scenarios.sh a4

# Todos los ataques (A1-A8, A9 manual)
bash scripts/setup-demo-attack-scenarios.sh all
```

**Resultado esperado:** ✅ Todos rechazados (altura ledger = 0, no se crearon bloques)

📖 **Ver detalles en:** `[PASOS_DE_ATAQUES.md](./PASOS_DE_ATAQUES.md)`

---



## ✅ Ejecutar Tests de Seguridad



### Opción 1: Desde navegador (en /infra)

Abre `http://localhost:3000/infra` → Haz clic en **"Ejecutar verificación"**

Resultado: **15+ tests pasan en vivo** (algunos tests hacen skip si Docker no disponible en contenedor)

### Opción 2: Desde terminal (host)

```bash
npm run test:seguridad
```

Resultado: **20/20 tests pasan** (incluye tests que manipulan contenedores)

📖 **Más información:** `[DIAGNOSTICO_TESTS.md](./DIAGNOSTICO_TESTS.md)`

### Panel de Infraestructura — Monitoreo de Nodos

<div align="center">
  <img src="./pantallas/panel_infra.jpg" alt="Panel de Infraestructura" width="700">
</div>

Vista de infraestructura con estado de los 4 nodos, quorum actual, consistencia del ledger e integridad de la cadena. Incluye botón para ejecutar verificación de seguridad.

---



## 🏛️ Arquitectura

```
WEB DASHBOARD (http://localhost:3000)
    ↓ HTTP GET + PKI header
BLOCKCHAIN BACKEND (Puertos 3001-3004)
    • 4 Nodos: Coordinador Nacional + 3 Hospitales
    • Hash-chain: Cada bloque contiene hash del anterior
    • PKI X.509: Firma digital en cada transacción
    • Endorsement: Requiere múltiples firmas
    • Ledger: JSON append-only en ./data/
    ↓
IoT Simulator (Telemetría cada 5s después del assignment)
```



### Componentes Principales


| Componente             | Ubicación        | Qué Hace                             |
| ---------------------- | ---------------- | ------------------------------------ |
| **Backend Blockchain** | `nodes/`         | Ledger, validación, PKI, endorsement |
| **Dashboard**          | `dashboard/`     | UI Next.js con gráficos y timeline   |
| **IoT Simulator**      | `iot-simulator/` | Genera telemetría realista           |
| **PKI CA**             | `ca/`            | Genera certificados X.509            |
| **Tests**              | `tests/`         | 20 tests STRIDE (seguridad)          |

### Dashboard — Detalle de Asignación y Compatibilidad

<div align="center">
  <img src="./pantallas/panel_dashboard2.jpg" alt="Dashboard Asignación" width="700">
</div>

Detalle de la asignación entre donante y receptor, con cálculo de compatibilidad HLA y grupo sanguíneo. Muestra puntuación de matching y validación de endorsement.

---



## ⚙️ Configuración



### Primer Setup

```bash
./scripts/reset.sh --force --with-certs
docker compose up --build
```



### Reset entre sesiones

```bash
# Opción 1: Limpiar datos, mantener certs
./scripts/reset.sh --force
docker compose up --build

# Opción 2: Limpiar TODO (regenera certs)
docker compose down -v
```



### Certificados (TTL: 72 horas)

Si pasaron 3+ días, regenerar:

```bash
./scripts/reset.sh --force --with-certs
docker compose up --build
```

---



## 🔍 Verificar Estado

```bash
# Salud de nodos
curl -s http://localhost:3001/health | jq

# Integridad del ledger
curl -s http://localhost:3001/verify-integrity | jq

# Contenedores en vivo
docker compose ps
```

---



## 📊 Características Implementadas

✅ **Blockchain:**

- Hash-encadenamiento immutable
- Validación de integridad en cada lectura
- Replicación entre nodos

✅ **Criptografía:**

- Certificados X.509 por organización
- Firma digital RSA-2048
- Validación de identidad (OU del certificado)

✅ **Lógica de Negocio:**

- Endorsement N-of-M (multisig)
- Validación HLA + compatibilidad de sangre
- Proyección de lectura consolidada

✅ **Transacciones:**

- `donor-registry` — Registrar donante
- `waiting-list` — Lista de espera
- `assignment` — Asignar órgano
- `custody` — Telemetría IoT con firma

✅ **Seguridad:**

- 20/20 tests STRIDE pasando
- Protección contra spoofing, tampering, replay
- Control de acceso por rol
- Auditoría completa

### Trazabilidad — Timeline de Eventos y Telemetría

<div align="center">
  <img src="./pantallas/trazabilidad1.jpg" alt="Timeline de Trazabilidad" width="700">
</div>

Línea temporal cronológica de todos los eventos del caso: registro de donante, lista de espera, asignación y lecturas de temperatura en tiempo real del contenedor IoT.

---



## 📂 Estructura del Repositorio

```
INTEGRAlab/
├── nodes/                   # Backend (ledger, PKI, endorsement)
├── dashboard/               # Frontend (Next.js + React)
├── iot-simulator/           # Generador de telemetría
├── ca/                      # Autoridad de certificación
├── tests/                   # Test suite (20 tests STRIDE)
├── scripts/                 # Utilidades (reset, setup)
├── docs/                    # Documentación académica
│   └── fundamentacion/      # 5 PDFs de análisis
├── PASOS_DETALLADOS.md      # Tutorial paso a paso
├── PASOS_DE_ATAQUES.md      # Escenarios de ataque
├── GUIA_DE_USO_ATAQUES.md   # Uso del script de ataques
├── DIAGNOSTICO_TESTS.md     # Estado de tests
└── README.md                # Este archivo
```

---



## 🛠️ Stack Tecnológico

**Backend:** Node.js 18 + Express + node-forge (PKI) + Crypto (SHA-256)

**Frontend:** Next.js 14 + React 18 + TypeScript + Tailwind + Recharts

**Testing & Deployment:** Docker Compose + Bash scripts

---

### Trazabilidad — Gráfico de Telemetría en Tiempo Real

<div align="center">
  <img src="./pantallas/trazabilidad2.jpg" alt="Gráfico de Telemetría" width="700">
</div>

Visualización en tiempo real de la telemetría del contenedor: temperatura, humedad y posición GPS. Incluye estadísticas (min, max, promedio) y alertas de desviaciones.

---



## 📞 Soporte


| Problema                            | Documento                                                          |
| ----------------------------------- | ------------------------------------------------------------------ |
| ¿Cómo empiezo?                      | `[PASOS_DETALLADOS.md](./PASOS_DETALLADOS.md)`                     |
| ¿Por qué se rechazó mi transacción? | `[PASOS_DE_ATAQUES.md](./PASOS_DE_ATAQUES.md)`                     |
| ¿Qué hacen los tests?               | `[DIAGNOSTICO_TESTS.md](./DIAGNOSTICO_TESTS.md)`                   |
| ¿Hay errores al correr tests?       | `[GUIA_TEST_COMPLETO.md](./GUIA_TEST_COMPLETO.md)`                 |
| ¿Por qué se tomó esta decisión?     | `[docs/DECISIONES_DE_ALCANCE.md](./docs/DECISIONES_DE_ALCANCE.md)` |


---



## 📄 Licencia

Proyecto de investigación académica. Ver LICENSE para detalles.

---

**Última actualización:** 2 de septiembre 2026 

**Tests:** ✅ 20/20 PASANDO