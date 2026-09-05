import os
import sys
from datetime import datetime, timezone
from typing import Optional

import joblib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "ml"))
from features import features_from_telemetry, T_MAX_NOMINAL  # noqa: E402

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "ml", "modelo_viabilidad.joblib")
MARGEN_SEGURIDAD = 1.20  # exige 20% de colchon entre horas viables y tiempo de viaje estimado

app = FastAPI(title="INTEGRA - API de Viabilidad de Organos", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # en produccion, restringe al dominio real del dashboard
    allow_methods=["*"],
    allow_headers=["*"],
)

_model_bundle = None


def get_model():
    global _model_bundle
    if _model_bundle is None:
        if not os.path.exists(MODEL_PATH):
            raise HTTPException(
                status_code=503,
                detail="Modelo no encontrado. Ejecuta primero: python3 ml/train_model.py",
            )
        _model_bundle = joblib.load(MODEL_PATH)
    return _model_bundle


ORGAN_MAP_EN_TO_ES = {
    "kidney": "rinon",
    "liver": "higado",
    "heart": "corazon",
    "lung": "pulmon",
    "pancreas": "pancreas",
}


def normalizar_organo(valor: str) -> str:
    v = valor.strip().lower()
    if v in T_MAX_NOMINAL:
        return v
    if v in ORGAN_MAP_EN_TO_ES:
        return ORGAN_MAP_EN_TO_ES[v]
    raise HTTPException(status_code=422, detail=f"Organo no reconocido: '{valor}'")


class LecturaTelemetria(BaseModel):
    """Mismo shape que TelemetryReading del dashboard."""
    timestamp: str  # ISO 8601
    temperaturaC: float
    humedadPct: Optional[float] = None  


class Destino(BaseModel):
    nombre: str
    distancia_km: float
    velocidad_estimada_kmh: float = 60.0


class SolicitudPrediccion(BaseModel):
    caso_id: str
    organo: str = Field(..., description="Enum de organType del dashboard, o rinon/higado/corazon/pulmon/pancreas")
    extraido_en: str = Field(..., description="ISO 8601. Ej: caseState.donorInfo.registeredAt")
    lecturas: list[LecturaTelemetria] = Field(..., min_length=1)
    destino_original: Optional[Destino] = None
    destinos_alternativos: list[Destino] = []


class OpcionDestino(BaseModel):
    nombre: str
    distancia_km: float
    tiempo_estimado_llegada_h: float
    margen_horas: float
    factible: bool


class RespuestaPrediccion(BaseModel):
    caso_id: str
    organo: str
    horas_viables_restantes_estimadas: float
    baseline_horas_reloj: float
    ajuste_por_telemetria_h: float
    viable_ahora: bool
    destino_original: Optional[OpcionDestino] = None
    destinos_alternativos: list[OpcionDestino] = []
    recomendacion: str
    nivel_alerta: str  # "normal" | "precaucion" | "critico"
    generado_en: str


def evaluar_destino(destino: Destino, horas_viables: float) -> OpcionDestino:
    tiempo_estimado_h = destino.distancia_km / max(destino.velocidad_estimada_kmh, 1.0)
    margen = horas_viables - tiempo_estimado_h
    factible = tiempo_estimado_h <= horas_viables / MARGEN_SEGURIDAD if horas_viables > 0 else False
    return OpcionDestino(
        nombre=destino.nombre,
        distancia_km=destino.distancia_km,
        tiempo_estimado_llegada_h=round(tiempo_estimado_h, 2),
        margen_horas=round(margen, 2),
        factible=factible,
    )


def construir_recomendacion(horas_viables: float, opcion_original: Optional[OpcionDestino],
                             opciones_alt: list[OpcionDestino]) -> tuple[str, str]:
    if horas_viables <= 0:
        return (
            "El organo ya supero la ventana estimada de viabilidad. Alertar de inmediato "
            "al coordinador y al equipo medico; evaluar descarte segun protocolo clinico.",
            "critico",
        )

    if opcion_original is None:
        # Sin datos de destino todavia: solo alertamos por horas restantes.
        if horas_viables < 2:
            return (
                f"Quedan aproximadamente {round(horas_viables, 2)} h de viabilidad estimada. "
                f"Margen muy ajustado: revisar cadena de frio y evaluar destinos mas cercanos.",
                "precaucion",
            )
        return (
            f"Quedan aproximadamente {round(horas_viables, 2)} h de viabilidad estimada. Sin "
            f"datos de destino para calcular si el traslado llega a tiempo.",
            "normal",
        )

    if opcion_original.factible:
        return (
            f"Mantener destino original ({opcion_original.nombre}). Llegada estimada en "
            f"{opcion_original.tiempo_estimado_llegada_h} h, dentro del margen de seguridad "
            f"({opcion_original.margen_horas} h de colchon).",
            "normal",
        )

    factibles = [o for o in opciones_alt if o.factible]
    if factibles:
        mejor = max(factibles, key=lambda o: o.margen_horas)
        return (
            f"Riesgo de no llegar a tiempo al destino original ({opcion_original.nombre}, "
            f"margen {opcion_original.margen_horas} h). Se recomienda reasignar a "
            f"'{mejor.nombre}' (llegada estimada {mejor.tiempo_estimado_llegada_h} h, "
            f"margen {mejor.margen_horas} h).",
            "precaucion",
        )

    return (
        f"Riesgo critico: ni el destino original ({opcion_original.nombre}) ni los destinos "
        f"alternativos evaluados son alcanzables dentro de la ventana de viabilidad estimada "
        f"({round(horas_viables, 2)} h restantes). Escalar al Coordinador Nacional para "
        f"decision de doble firma / posible descarte.",
        "critico",
    )


@app.get("/health")
def health():
    return {"status": "ok", "modelo_cargado": os.path.exists(MODEL_PATH)}


@app.post("/predict/viabilidad", response_model=RespuestaPrediccion)
def predecir_viabilidad(payload: SolicitudPrediccion):
    organo = normalizar_organo(payload.organo)
    bundle = get_model()
    modelo = bundle["modelo"]

    lecturas = [l.model_dump() for l in payload.lecturas]
    X_ultima, baseline = features_from_telemetry(lecturas, organo, payload.extraido_en)

    residual_pred = float(modelo.predict(X_ultima)[0])
    horas_viables = baseline + residual_pred

    opcion_original = evaluar_destino(payload.destino_original, horas_viables) if payload.destino_original else None
    opciones_alt = [evaluar_destino(d, horas_viables) for d in payload.destinos_alternativos]

    recomendacion, nivel_alerta = construir_recomendacion(horas_viables, opcion_original, opciones_alt)

    return RespuestaPrediccion(
        caso_id=payload.caso_id,
        organo=organo,
        horas_viables_restantes_estimadas=round(horas_viables, 2),
        baseline_horas_reloj=round(baseline, 2),
        ajuste_por_telemetria_h=round(residual_pred, 2),
        viable_ahora=horas_viables > 0,
        destino_original=opcion_original,
        destinos_alternativos=opciones_alt,
        recomendacion=recomendacion,
        nivel_alerta=nivel_alerta,
        generado_en=datetime.now(timezone.utc).isoformat(),
    )