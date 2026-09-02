# Guía de Uso: Escenarios de Ataque

**Cómo ejecutar simulaciones de ataque y verificación de seguridad.**

---

## Quick Start

### 1. Asegurate que la red esté lista

```bash
./scripts/reset.sh --force
docker compose up --build -d
curl -s http://localhost:3001/health | jq '.ledgerHeight'
# Debe mostrar: 0
```

### 2. Ejecutar un ataque específico

```bash
# Spoofing con cert autofirmado
bash scripts/setup-demo-attack-scenarios.sh a1

# Firma inválida
bash scripts/setup-demo-attack-scenarios.sh a3

# Todos los ataques a la vez
bash scripts/setup-demo-attack-scenarios.sh all
```

### 3. Ver resultados en el dashboard

```
http://localhost:3000/infra    # Infraestructura + altura del ledger
http://localhost:3000/dashboard # Panel clínico (vacío después de ataques)
```

---

## Escenarios de Ataque Disponibles

### A1: Spoofing — Cert autofirmado
```bash
bash scripts/setup-demo-attack-scenarios.sh a1
```
- **Intento:** Alguien registra un donante con certificado falso (no de CA INTEGRA)
- **Defensa:** Validación X.509 contra CA
- **Esperado:** ✘ RECHAZADO (401 Unauthorized)

### A2: Spoofing — Cert de otra org
```bash
bash scripts/setup-demo-attack-scenarios.sh a2
```
- **Intento:** Usa cert válido de coordinador-nacional pero reclama ser hospital-donante
- **Defensa:** Validación de identidad (OU del certificado)
- **Esperado:** ✘ RECHAZADO (401 Unauthorized)

### A3: Tampering — Firma modificada
```bash
bash scripts/setup-demo-attack-scenarios.sh a3
```
- **Intento:** Obtiene firma válida y modifica 1 byte
- **Defensa:** Verificación criptográfica RSA
- **Esperado:** ✘ RECHAZADO (401 Unauthorized)

### A4: Endorsement incompleto — 1 firma
```bash
bash scripts/setup-demo-attack-scenarios.sh a4
```
- **Intento:** Crear waiting-list con solo firma del coordinador (necesita 2)
- **Defensa:** Política N-of-M
- **Esperado:** ✘ RECHAZADO (403 Forbidden)

### A5: Endorsement incompleto — sin hospital
```bash
bash scripts/setup-demo-attack-scenarios.sh a5
```
- **Intento:** Assignment con solo coordinador, sin hospital-donante
- **Defensa:** Política de 2 firmas específicas
- **Esperado:** ✘ RECHAZADO (403 Forbidden)

### A6: RBAC — Lectura no autorizada
```bash
bash scripts/setup-demo-attack-scenarios.sh a6
```
- **Intento:** Acceso desde origen no autorizado (no localhost:3000)
- **Defensa:** CORS restringido
- **Esperado:** ⚠ BLOQUEADO (sin Access-Control-Allow-Origin)

### A7: RBAC — IoT escribe en WaitingList
```bash
bash scripts/setup-demo-attack-scenarios.sh a7
```
- **Intento:** Dispositivo IoT intenta crear lista de espera
- **Defensa:** Política de endorsement por actor
- **Esperado:** ✘ RECHAZADO (403 Forbidden)

### A8: Replay — Nonce expirado
```bash
bash scripts/setup-demo-attack-scenarios.sh a8
```
- **Intento:** Reutilizar lectura IoT antigua (> 5 minutos)
- **Defensa:** Validación de nonce fresco
- **Esperado:** ✘ RECHAZADO (400 Bad Request)

### A9: Integridad — Ledger manipulado offline
**Manual** (ver PASOS_DE_ATAQUES.md para pasos detallados)
- **Intento:** Editar `ledger.json` a mano
- **Defensa:** Cadena de hashes (hash-chain)
- **Esperado:** `curl /verify-integrity` → `{ "valid": false }`

---

## Suite Completa de Tests de Seguridad

### Opción 1: Desde el navegador (en /infra)

Haz clic en **"Ejecutar verificación"** en `http://localhost:3000/infra`

```
Resultado esperado:
✓ 15-17 tests pasados
✘ test16 / test19 pueden hacer skip (sin Docker en dashboard)
Tiempo: ~30 segundos
```

### Opción 2: Desde la línea de comandos (host)

```bash
npm run test:seguridad
```

Resultado esperado:
```
✓ 20 tests pasados (todos funcionan, incluido test16 y test19)
Tiempo: ~2 minutos
```

---

## Interpretación de Resultados

### Verde ✓ ESPERADO
El ataque fue **rechazado correctamente**. El sistema detectó y bloqueó el intento malicioso.

### Rojo ✘ FALLA DE SEGURIDAD
El ataque **NO fue rechazado**. Hay un agujero de seguridad.

### Amarillo ⚠ BLOQUEADO (CORS)
El navegador bloqueó la solicitud por CORS. No es rechazo de la aplicación, es protección del navegador.

---

## Checklist de Verificación

```bash
# 1. Red limpia
curl -s http://localhost:3001/health | jq '.ledgerHeight'
# Esperado: 0

# 2. Ejecutar todos los ataques
bash scripts/setup-demo-attack-scenarios.sh all

# 3. Altura no debe cambiar (ataques rechazados)
curl -s http://localhost:3001/health | jq '.ledgerHeight'
# Esperado: 0 (mismo que antes)

# 4. Integridad debe ser válida (no hubo cambios)
curl -s http://localhost:3001/verify-integrity | jq
# Esperado: { "valid": true, "length": 0 }

# 5. Dashboard debe estar vacío (no se crearon bloques)
curl -s http://localhost:3001/health | jq
# Verificar en http://localhost:3000/dashboard → "Todavía no hay donantes"
```

---

## Diferencia: Ataques vs. Caso Normal

### Caso normal (PASOS_DETALLADOS.md)
```bash
bash scripts/setup-demo-pitch-data.sh
# Resultado: ✓ 3 bloques en el ledger
#           ✓ IoT escribe bloques custody cada 5s
#           ✓ Dashboard muestra donante + paciente + asignación
```

### Caso ataques (PASOS_DE_ATAQUES.md)
```bash
bash scripts/setup-demo-attack-scenarios.sh all
# Resultado: ✘ 0 bloques en el ledger (todos rechazados)
#           ✘ Dashboard sigue vacío
#           ✓ Sistema funcionando correctamente (defenderá)
```

---

## Notas Importantes

### 1. Ledger no debe cambiar
Después de `setup-demo-attack-scenarios.sh`, la altura del ledger debe seguir siendo **0**. Si sube, es que algunos ataques no fueron bloqueados (security breach).

### 2. Los tests de resiliencia necesitan Docker
Si ejecutas desde `/infra` (dashboard en Docker):
- test16 (caída de nodo) → **SKIP** (Docker no disponible)
- test19 (quorum con peers down) → **SKIP** (Docker no disponible)

Esto es **esperado y correcto**. Ejecuta desde el host para todos los tests:
```bash
npm run test:seguridad
```

### 3. No es un hack tutorial
Los scripts **simulan ataques reales**, pero muestran cómo el sistema los rechaza. No son instrucciones de hacking; son **pruebas de defensa**.

---

## Referencia de Documentos

| Documento | Propósito |
|-----------|-----------|
| `PASOS_DETALLADOS.md` | Flujo normal: registrar donante → asignación → trazabilidad |
| `PASOS_DE_ATAQUES.md` | Flujo de ataques: 9 escenarios con explicación técnica |
| `DIAGNOSTICO_TESTS.md` | Estado del botón "Verificación" y cómo funciona |
| `GUIA_DE_USO_ATAQUES.md` | Este archivo — instrucciones rápidas |

---

## Troubleshooting

### Q: El script dice "Red no disponible"
**A:** Verifica que `docker compose up --build -d` esté corriendo:
```bash
curl -s http://localhost:3001/health
```

### Q: El botón "Ejecutar verificación" no funciona
**A:** Ver `DIAGNOSTICO_TESTS.md`. El botón funciona; algunos tests hace skip si Docker no está disponible en el contenedor.

### Q: Después de un ataque, el ledger creció pero no debería
**A:** Algunos tests pueden haber pasado si hubo cambios en el código. Verifica con `npm run test:seguridad` desde el host.

### Q: ¿Puedo ejecutar ataques múltiples veces?
**A:** Sí. Primero ejecuta `./scripts/reset.sh --force` para limpiar, luego `docker compose up --build -d` nuevamente.

---

**Última actualización:** 2 de septiembre 2026

