# Cómo integrar y correr este scaffold en INTEGRAlab

## 1. Cómo mergearlo con tu repo existente

Tu repo `INTEGRAlab` ya tiene un `README.md` con historial de commits. Para no pisar nada, copiá el contenido de esta carpeta (`INTEGRAlab-scaffold/`) **dentro** de tu repo local ya clonado, sin sobrescribir tu README raíz:

```bash
# parado en la carpeta que contiene tanto INTEGRAlab/ como este scaffold
cp -r INTEGRAlab-scaffold/ca INTEGRAlab/
cp -r INTEGRAlab-scaffold/nodes INTEGRAlab/
cp -r INTEGRAlab-scaffold/iot-simulator INTEGRAlab/
cp -r INTEGRAlab-scaffold/docs INTEGRAlab/
cp INTEGRAlab-scaffold/docker-compose.yml INTEGRAlab/
cp INTEGRAlab-scaffold/.gitignore INTEGRAlab/      # si ya tenías uno, revisá que no se pierda nada
cp INTEGRAlab-scaffold/COMO_USAR_ESTE_SCAFFOLD.md INTEGRAlab/
```

Luego:

```bash
cd INTEGRAlab
git add .
git commit -m "Scaffold inicial: PKI, nodos de organizacion, simulador IoT"
git push origin main
```

## 2. Requisitos

- Docker y Docker Compose v2.20+ (`docker compose version` para verificar — el archivo usa `condition: service_completed_successfully`, que requiere esa versión o superior).

## 3. Levantar todo

```bash
docker compose up --build
```

Orden de arranque:
1. `ca-setup` genera toda la jerarquía de PKI en `./certs` (Root CA, 4 CAs intermedias, 4 certificados de organización, CA de IoT + 1 certificado de dispositivo) y termina.
2. Los 4 nodos de organización arrancan una vez que `ca-setup` terminó con éxito, cada uno con su propio ledger en `./data/<org>/ledger.json`.
3. El simulador IoT arranca y empieza a transmitir telemetría firmada al nodo `hospital-donante` cada 5 segundos (con `SIMULAR_FALLA_TEMP=true`, la 5ta lectura sale fuera de rango a propósito para ver la alerta).

Vas a ver en los logs cómo cada lectura del sensor se convierte en un bloque nuevo en el ledger de `hospital-donante`, y cómo ese bloque se replica y revalida en los otros 3 nodos.

## 4. Probar el flujo manualmente con curl

Los nodos quedan expuestos en:
- `coordinador-nacional` → http://localhost:3001
- `coordinador-provincial` → http://localhost:3002
- `hospital-donante` → http://localhost:3003
- `hospital-receptor` → http://localhost:3004

### Registrar un donante (requiere solo firma de hospital-donante)

Primero pedimos al propio nodo del hospital que firme el payload (simula que el hospital opera desde su propio nodo con su propia clave):

```bash
PAYLOAD='{"donanteId":"D-001","grupoSanguineo":"A+","hla":"HLA-A2-B7"}'

FIRMA_HOSPITAL=$(curl -s -X POST http://localhost:3003/sign \
  -H "Content-Type: application/json" \
  -d "{\"payload\": $PAYLOAD}" | jq -r .signature)

curl -s -X POST http://localhost:3003/tx/donor-registry \
  -H "Content-Type: application/json" \
  -d "{\"payload\": $PAYLOAD, \"signatures\": [{\"actor\":\"hospital-donante\",\"signature\":\"$FIRMA_HOSPITAL\"}]}" | jq
```

### Intentar modificar la lista de espera con una sola firma (debe fallar)

```bash
PAYLOAD='{"receptorId":"R-052","posicion":1}'
FIRMA_NACIONAL=$(curl -s -X POST http://localhost:3001/sign -H "Content-Type: application/json" -d "{\"payload\": $PAYLOAD}" | jq -r .signature)

curl -s -X POST http://localhost:3001/tx/waiting-list \
  -H "Content-Type: application/json" \
  -d "{\"payload\": $PAYLOAD, \"signatures\": [{\"actor\":\"coordinador-nacional\",\"signature\":\"$FIRMA_NACIONAL\"}]}" | jq
# Esperado: 403, "requiere firma de coordinador-nacional + al menos 1 organización adicional"
```

Ahora con las 2 firmas requeridas (debe funcionar):

```bash
FIRMA_PROVINCIAL=$(curl -s -X POST http://localhost:3002/sign -H "Content-Type: application/json" -d "{\"payload\": $PAYLOAD}" | jq -r .signature)

curl -s -X POST http://localhost:3001/tx/waiting-list \
  -H "Content-Type: application/json" \
  -d "{\"payload\": $PAYLOAD, \"signatures\": [
        {\"actor\":\"coordinador-nacional\",\"signature\":\"$FIRMA_NACIONAL\"},
        {\"actor\":\"coordinador-provincial\",\"signature\":\"$FIRMA_PROVINCIAL\"}
      ]}" | jq
```

### Leer el ledger (control de acceso)

```bash
# Sin identificarse -> 403
curl -s http://localhost:3003/ledger | jq

# Como el propio hospital -> 200
curl -s -H "x-actor: hospital-donante" http://localhost:3003/ledger | jq

# Como auditor -> 200
curl -s -H "x-actor: auditor" http://localhost:3003/ledger | jq
```

### Verificar integridad de la cadena de hashes

```bash
curl -s http://localhost:3003/verify-integrity | jq
```

Para probar el caso de tampering: parar el compose, editar a mano un campo dentro de `./data/hospital-donante/ledger.json` en un bloque que no sea el último, y volver a correr `verify-integrity` — debería devolver `valid: false` con el índice del bloque roto.

## 5. Qué falta (próximos días del cronograma)

- Endpoint/flujo para `AssignmentContract` con datos de compatibilidad HLA de ejemplo (mismo patrón que `waiting-list`).
- Escenarios de ataque adicionales como script reproducible (certificado inválido, replay de telemetría vieja, actor sin rol intentando leer, caída de un nodo).
- Suite de pytest o script Node que automatice los 18 tests del plan y los deje corriendo con un solo comando para la demo del pitch.
