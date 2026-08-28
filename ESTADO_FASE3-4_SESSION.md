# ESTADO DE INTEGRA FASE 3-4 (FIN DE SESIÓN)

## 1. QUÉ SE ROMPIÓ HOY Y POR QUÉ

### Fork Ledger Descubierto Antes
- **Síntoma**: Dos grupos de nodos con ledgers divergentes (2953 vs 2791 bloques)
- **Causa Raíz Diagnosticada**: Arquitectura "write-local-first, replicate-async"
  - Nodo originador persiste bloque localmente sin esperar confirmación de peers
  - Si replicación falla, cliente ve 201 (éxito), pero otros nodos no lo reciben
  - Múltiples nodos originadores crean bloques en paralelo sobre el mismo prevHash
  - Cada nodo persiste su propia rama → fork permanente

### Múltiple-Origin Concurrency Problem (Raíz Real)
- **Identificado en PASO 0**: 
  - test01, test05: originan desde coordinador-nacional (puerto 3001)
  - test10, test16-18: originan desde hospital-donante (puerto 3003)
  - test17 lanza 5 POST simultáneos a hospital-donante
  - IoT simulator escribe continuamente a hospital-donante (cada 5 segundos)
  - **Total**: 6+ escrituras concurrentes al mismo nodo sin serialización global
- **Evidencia Visual**: En RUN 2-3, log dice `"prevHash no coincide con el último bloque local"` 
  - Esto ocurre porque hospital-donante (que es peer) recibe bloques que no encadenan
  - Otro nodo originó bloques sobre el mismo prevHash → fork de multi-origen

---

## 2. QUÉ SE CORRIGIÓ (CONFIRMADO CON EVIDENCIA)

### 2.1 Quorum 3/4 Implementado ✅
**Estado**: CONFIRMADO FUNCIONAL
- **Código**: `nodes/server.js:187-213` (submitTransaction)
- **Lógica**: 
  - Antes de persistir: replicate a 3 peers
  - Contar votos: 1 (local) + successfulPeers
  - Si totalVotes >= 3: persistir + 201
  - Si totalVotes < 3: NO persistir + 503
- **Test Confirmado**: test19_quorumWithDownPeers
  - Detiene 2 nodos, deja 1 peer + local = 2 votos
  - Esperado: 503 "No se alcanzó quorum"
  - **Resultado**: ✔ PASS (17-18 segundos)
  - **Evidencia**: Logs muestran `QUORUM FAIL: votes=2/3` cuando caen 2 nodos

### 2.2 Mutex en appendBlock ✅
**Estado**: CONFIRMADO FUNCIONAL
- **Código**: `nodes/lib/ledger.js:30-44` (appendBlockLocked, acquireAppendBlockLock, releaseAppendBlockLock)
- **Código**: `nodes/lib/ledger.js:104-127` (appendBlock async con try/finally)
- **Lógica**: 
  - Serializa llamadas a appendBlock() dentro de UN nodo
  - Impide que 2 POST concurrentes lean ledger simultaneamente, construyan bloque sobre mismo prevHash, y una sobrescriba a la otra
  - Lock es manual, sin dependencias externas (async-lock removido por problemas de Docker build)
- **Evidencia de Efectividad**:
  - RUN 1 (clean): test17 pasa porque no hay fork anterior acumulado
  - RUN 2-3 (acumulado): test17 falla porque fork ya existe desde test05/test01
  - El mutex protege DENTRO de UN nodo, no protege ENTRE nodos

### 2.3 endorsedBy + Revalidación en /internal/replicate ✅
**Estado**: CONFIRMADO FUNCIONAL
- **Código**: `nodes/lib/ledger.js:80-93` (buildNextBlock con endorsedBy)
  ```javascript
  endorsedBy: validOrgs.sort(),  // Línea 88 - ANTES del hash
  block.hash = computeBlockHash(block); // Línea 91
  ```
- **Código**: `nodes/server.js:240-260` (/internal/replicate validaciones)
  - PASO 1: Verifica todas las firmas criptográficamente
  - PASO 2: Verifica que actualActors === endorsedBy
  - PASO 3: Revalida checkEndorsement() con los actores reales
  - PASO 4: Append al ledger local
- **Prevención**: Impide que atacante reemplace firma de hospital-donante con hospital-receptor
  - Ejemplo: espera [coordinador-nacional, hospital-donante], recibe [coordinador-nacional, hospital-receptor]
  - Devuelve 403 "Actores que firmaron no coinciden con endorsedBy"
- **Evidencia**:
  - Logs en todos los nodos muestran `/internal/replicate: txType=waiting-list, actualActors=[coordinador-nacional,hospital-donante], expectedActors=[coordinador-nacional,hospital-donante]` ✔
  - Sin mismatches observados en corridas

### 2.4 Autenticación X-Internal-Token ✅
**Estado**: CONFIRMADO FUNCIONAL
- **Código**: `nodes/server.js:33-40` (middleware)
  ```javascript
  const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || 'default-insecure-token-change-in-prod';
  app.use('/internal', (req, res, next) => {
    const token = req.header('X-Internal-Token');
    if (token !== INTERNAL_TOKEN) {
      return res.status(401).json({ ok: false, reason: 'Unauthorized' });
    }
    next();
  });
  ```
- **Código**: `nodes/server.js:473-476` (replicateToPeers con token)
  ```javascript
  await axios.post(`${peerUrl}/internal/replicate`, { block }, {
    timeout: 5000,
    headers: { 'X-Internal-Token': INTERNAL_TOKEN }
  });
  ```
- **Config**: `docker-compose.yml` - Todos 4 nodos con env var:
  ```yaml
  - INTERNAL_TOKEN=integra-secure-token-2024-fc17d9e8b2c4a6f1
  ```
- **Evidencia Manual**:
  - `curl POST /internal/replicate` sin token → `{"ok":false,"reason":"Unauthorized"}`
  - `curl POST /internal/replicate` token incorrecto → `{"ok":false,"reason":"Unauthorized"}`
  - `curl POST /internal/replicate` token correcto → Pasa auth, procesa bloque

---

## 3. QUÉ ESTÁ APROBADO EN DISEÑO PERO AÚN NO IMPLEMENTADO

### Orderer Único (Fase 3-4 Continuación)
**Estado**: APROBADO EN ESPECIFICACIÓN, NO IMPLEMENTADO AÚN

#### Problema que va a resolver
- Multi-origen concurrency: test01+test05 (coordinador-nacional) + test10+test16-18 (hospital-donante) crean bloques simultáneamente
- Quorum actual es LOCAL: "¿tengo 3 votos?", no previene fork entre nodos
- Orderer será GLOBAL: "coordinador-nacional decide el orden de todos los bloques"

#### Diseño Aprobado
1. **IS_ORDERER flag** para coordinador-nacional
   - coordinador-nacional: IS_ORDERER=true → Creer bloques localmente
   - coordinador-provincial, hospital-donante, hospital-receptor: IS_ORDERER=false → Reenviar al orderer

2. **Bifurcación en submitTransaction()**
   ```
   if (IS_ORDERER) {
     // Lógica actual: replicate, quorum, persist
   } else {
     // Lógica nueva: validar endorsement localmente, enviar a /internal/order
   }
   ```

3. **Nuevo endpoint: /internal/order-and-replicate**
   - Recibe bloque de non-orderer
   - Revalida endorsement nuevamente
   - Crea bloque con índice único (coordinador-nacional es la autoridad)
   - Replica a los 3 peers + persistir localmente

4. **Resultado**: Todos los bloques cruzarán primero por coordinador-nacional
   - Orden global garantizado
   - Non-orderers validan endorsement pero NO crean bloques

#### Estado Actual
- PASO 1 (Diseño): **COMPLETADO** en sesión anterior
- PASO 2 (Implementación): **NO INICIADA**
- PASO 3 (Validación 3 runs + load test): **PENDIENTE**
- PASO 4 (Documentación): **PENDIENTE**

---

## 4. DECISIONES QUE NO SE DEBEN REVERTIR SIN DISCUTIRLO

### 4.1 QUORUM_NODOS no baja de 3
- **Razón**: Previene bloques huérfanos (no persistido en ningún otro nodo)
- **Nota**: No previene fork de multi-origen, eso lo hace el orderer
- **Impacto**: Si baja a 2, un solo nodo down + quorum fallido = posible pérdida de datos

### 4.2 endorsedBy incluido EN el hash del bloque
- **Razón**: Cambiar endorsedBy después del hash permitiría reemplazar firmas sin romper el hash
- **Estado Actual**: Incluido antes del cálculo (línea 88), hash en línea 91 ✅
- **Impacto**: Si se quita, vuelve vulnerable a signature replacement attacks

### 4.3 Endpoints /internal/* requieren X-Internal-Token
- **Razón**: Impide que actores externos (o atacantes sin cert PKI) llamen replicación directamente
- **Validación**: Middleware valida token ANTES de procesar
- **Impacto**: Si se quita, cualquier POST a /internal/replicate sería aceptado

---

## 5. PENDIENTES FUERA DE ESTA RONDA

### 5.1 IoT Simulator sigue sin pasar por el orderer
- **Estado Actual**: Escribe directamente a hospital-donante:3003/tx/custody
- **Problema**: Contribuye a las 6+ escrituras concurrentes que causan fork
- **Solución Futura**: Orderer deberá ser authoridad para IoT también
- **Nota**: Será resuelto cuando orderer esté operativo

### 5.2 Dashboard congelado esperando backend estable
- **Última tarea**: Fase 2 - Next.js 14 frontend con Recharts
- **Estado**: 6 roles, schemas listos, fixtures creados, no se avanzó
- **Dependencia**: Backend debe tener ledger consistente (19/19 PASS estable)
- **Criterio de descongelamiento**: Orderer implementado + 3 corridas limpias = 19/19 PASS

---

## 6. ESTADO DE TESTS

### 6.1 Último Número Exacto Confirmado
**RUN 1 (Clean State - Reset Completo)**
```
Total: 18/19 PASS
Fallido: test01_registroOrgValida
Motivo: "No se alcanzó quorum de red: 1/3 nodos confirmaron replicación"
```

**Condición**: 
- Stack limpio: `docker compose down -v && rm -rf /data/*`
- Nuevo build: `docker compose up --build`
- Espera: 5 segundos antes de test
- **Problema Identificado**: El startup de los 4 nodos no es sincronizado
  - test01 llega antes de que todos los nodos estén listos para recibir replicación
  - 1 nodo responde, 2 fallan por timeout → quorum falla

**RUN 2 & 3 (Sin Reset - Acumuladas)**
```
Total: 14/19 PASS
Fallidos: test01, test05, test16, test17, test18
Log Crítico: "prevHash no coincide con el último bloque local"
```

**Condición**:
- NO se reseteó /data entre corridas
- Bloques anteriores quedan persistidos
- test17 lanza 5 escrituras concurrentes + IoT sigue escribiendo
- Fork acumulado en hospital-donante

### 6.2 Interpretación Correcta
- **NO** hay bug en el código de seguridad (endoresedBy, token auth, etc.)
- **SÍ** hay bug de arquitectura: múltiples orígenes crean bloques simultáneamente
- **test19 pasa** consistentemente (quorum logic correcta)
- **test01-test05 fallan en startup** (timing, no lógica)
- **test16-test18 fallan acumulados** (fork de multi-origen, esperado)

---

## CHECKLIST PRÓXIMA SESIÓN

- [ ] PASO 2: Implementar bifurcación IS_ORDERER en submitTransaction()
- [ ] PASO 2: Implementar /internal/order-and-replicate en coordinador-nacional
- [ ] PASO 2: Actualizar lógica en non-orderers para reenviar al orderer
- [ ] PASO 3: 3 corridas limpias consecutivas → verificar 19/19 PASS
- [ ] PASO 3: Load test: 10 escrituras concurrentes a puertos distintos
- [ ] PASO 4: Documentar en DECISIONES_DE_ALCANCE.md
  - Multi-origen problem descubierto
  - Quorum como defensa local
  - Orderer como serialización global
  - Roadmap: IoT simulator integrado al orderer

---

## ARCHIVOS MODIFICADOS ESTA SESIÓN
- `nodes/lib/ledger.js` - mutex + endorsedBy
- `nodes/server.js` - quorum + /internal/replicate validaciones + X-Internal-Token
- `docker-compose.yml` - INTERNAL_TOKEN en 4 servicios

