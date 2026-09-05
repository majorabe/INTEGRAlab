# Prototipo ML de viabilidad de órganos — INTEGRAlab

Predice, a partir de la telemetría real del contenedor (temperatura), cuántas
horas de viabilidad le quedan a un órgano en traslado, y (cuando haya datos
de destino) si conviene mantener el hospital original o reasignar a uno más
cercano. Ya está integrado y funcionando dentro del dashboard de INTEGRAlab.

## Estado actual ✅

- Modelo entrenado y funcionando (Gradient Boosting sobre features de
  ventana móvil de temperatura).
- API en FastAPI (`ml-viabilidad/api/`) corriendo en el puerto 8001.
- Tarjeta `ViabilidadCard.tsx` integrada en `app/dashboard/casos/[id]/page.tsx`,
  mostrando horas restantes y nivel de alerta con datos reales del caso.
- **Pendiente:** recomendación de destino (necesita un módulo de
  distancias/ETA a hospitales que el dashboard todavía no tiene — ver
  "Qué falta" al final).

## Arquitectura

```
INTEGRAlab/
├── docker-compose.yml          # nodos del ledger + dashboard (Docker)
├── dashboard/                  # Next.js — corre DENTRO de Docker
│   ├── app/api/viabilidad/route.ts     # puente hacia la API de Python
│   └── components/ViabilidadCard.tsx   # tarjeta de alerta en el caso
└── ml-viabilidad/               # Python — corre FUERA de Docker, en tu máquina
    ├── data/generate_synthetic_data.py
    ├── ml/
    │   ├── features.py          # feature engineering + línea base por órgano
    │   ├── train_model.py       # entrena y guarda el modelo
    │   ├── smoke_test.py        # prueba rápida sin la API
    │   └── modelo_viabilidad.joblib
    └── api/
        ├── main.py               # API FastAPI (puerto 8001)
        └── ejemplo.json
```

**Por qué la API de Python corre fuera de Docker:** el dashboard ya vive en
un contenedor (`docker-compose.yml`), pero la API de ML no tiene su propio
servicio ahí — corre directo en tu máquina con `uvicorn`. Por eso el
contenedor del dashboard necesita `host.docker.internal` en vez de
`localhost` para alcanzarla (ver más abajo). Migrar la API de ML a su
propio servicio en `docker-compose.yml` es una mejora pendiente razonable
(ver "Qué ampliaría primero").

## Enfoque de ML (y por qué)

- **Series de tiempo con ventana móvil + Gradient Boosting**, no LSTM ni
  grafos todavía — es interpretable y suficiente para el volumen de datos
  sintéticos actual (~900 casos).
- **Separación línea base vs. residual**, la parte más importante del
  diseño: `horas_max_isquemia_del_órgano − tiempo_transcurrido` es
  determinista (protocolo clínico conocido); el modelo solo aprende el
  **ajuste** que provocan las lecturas de temperatura (excesos tipo Q10).
  Sin esta separación, el modelo tiende a memorizar "órgano + tiempo" e
  ignorar la temperatura — lo comprobé entrenando ambas versiones.
- **Solo temperatura + tiempo transcurrido** como features (no batería,
  velocidad, GPS): se ajustó así porque el `TelemetryReading` real de
  INTEGRAlab (`iot-simulator`) solo genera `temperaturaC`, `humedadPct` y
  `timestamp`. `humedadPct` se recibe en la API pero **todavía no se usa**
  en la predicción (ver "Qué ampliaría primero").

**Nota:** los umbrales de isquemia por órgano en
`ml/features.py::T_MAX_NOMINAL` son valores de referencia simplificados
para que el prototipo sea demostrable, **no son guía clínica real**.

## Cómo correr todo el stack

**1. Levantar el dashboard y los nodos (Docker):**
```bash
docker compose up -d
```

**2. Levantar la API de ML (en tu máquina, fuera de Docker):**
```bash
cd ml-viabilidad
python -m venv venv
venv\Scripts\activate          # Windows (o: source venv/bin/activate en Mac/Linux)
pip install -r requirements.txt

python data/generate_synthetic_data.py
python ml/train_model.py       # ¡IMPORTANTE! entrena SIEMPRE en tu propia máquina,
                                # no copies el .joblib de otra persona/versión de sklearn
                                # (ver "Problemas comunes" más abajo)

cd api
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

**3. Configurar la variable de entorno en `docker-compose.yml`**, dentro del
servicio `dashboard:`:
```yaml
  dashboard:
    environment:
      - NODE_ENV=production
      - INTEGRA_REPO_ROOT=/integralab
      - INTEGRA_NODES_HOST_MODE=compose
      - CERTS_DIR=/certs
      - ML_VIABILIDAD_API_URL=http://host.docker.internal:8001
```
Luego: `docker compose up -d dashboard` (recrea solo ese contenedor, no
hace falta rebuild completo).

**4. Probar:** abre `localhost:3000/dashboard/casos/<id-de-un-caso-con-telemetria>`
y busca la tarjeta "Viabilidad estimada (ML)".

## Esquema real de la API

`POST http://localhost:8001/predict/viabilidad`
```json
{
  "caso_id": "demo-donor-001",
  "organo": "kidney",
  "extraido_en": "2026-08-25T09:00:00Z",
  "lecturas": [
    {"timestamp": "2026-08-25T10:00:00Z", "temperaturaC": 4.0, "humedadPct": 85.0}
  ],
  "destino_original": {"nombre": "...", "distancia_km": 300, "velocidad_estimada_kmh": 65},
  "destinos_alternativos": [{"nombre": "...", "distancia_km": 40, "velocidad_estimada_kmh": 55}]
}
```
`organo` acepta el enum real del dashboard (`kidney`, `liver`, `heart`,
`lung` — mapeado internamente a español en `api/main.py::ORGAN_MAP_EN_TO_ES`)
o directamente `rinon/higado/corazon/pulmon/pancreas`.
`destino_original` / `destinos_alternativos` son **opcionales** — sin
ellos, la API solo da horas restantes + nivel de alerta.

## Problemas comunes 

| Síntoma | Causa | Solución |
|---|---|---|
| `python3` no reconocido en Windows | Alias de Microsoft Store | Usa `python` a secas, o `python -m uvicorn ...` |
| `503 Modelo no encontrado` | `main.py` no estaba dentro de una carpeta `api/`, o el `.joblib` no existía | Verifica la estructura de carpetas; corre `train_model.py` |
| `Cannot find module 'next/server'` (subrayado rojo) | Falta `npm install` en `dashboard/` | Correr `npm install`, o `Ctrl+Shift+P → Restart TS Server` |
| Tarjeta dice "No se pudo conectar con la API de ML" | El dashboard corre en Docker; `localhost` ahí apunta al contenedor, no a tu máquina | Usar `host.docker.internal` en el `environment:` de `docker-compose.yml` (ver arriba) — **no** en `.env.local`, ese no lo lee el contenedor |
| `ModuleNotFoundError: No module named '_loss'` al cargar el `.joblib` | El modelo se entrenó con una versión de scikit-learn distinta a la instalada | **Reentrena localmente**: `python ml/train_model.py` en tu propio venv, nunca copies el `.joblib` de otra máquina/entorno |

## Qué ampliaría primero

1. **Módulo de distancia/ETA a hospitales.** Es lo único que falta para que
   la recomendación de "mantener destino / cambiar a uno más cercano"
   funcione — ahora mismo la API la soporta, pero el dashboard no tiene de
   dónde sacar `distancia_km` a cada hospital candidato.
2. **Reemplazar la línea base y el modelo físico de daño por datos reales**
   validados con tu mentor — hoy el modelo es tan bueno como mi simulador.
3. **Usar `humedadPct`** en la predicción (se recibe pero no se usa todavía).
4. **Mover la API de ML a su propio servicio en `docker-compose.yml`**, para
   no depender de que corra manualmente fuera de Docker en tu máquina.
5. **Cuantificar incertidumbre** (regresión por cuantiles) en vez de un
   solo número de horas — más honesto para una decisión médica.
6. **Grafo de red logística** para generar automáticamente la lista de
   destinos alternativos (sugerencia original de tu mentor), en vez de que
   alguien la escriba a mano.
