from __future__ import annotations
import numpy as np
import pandas as pd

ORGANOS = ["rinon", "higado", "corazon", "pulmon", "pancreas"]
WINDOW = 6  # ultimas 6 lecturas = 30 minutos, si el sensor reporta cada 5 min

# Umbrales NOMINALES (conocidos/publicados) de isquemia fria maxima por
# organo. Son valores de referencia SIMPLIFICADOS para el prototipo, NO una
# guia clinica real - deben ajustarse con tu mentor antes de usarse en serio.
T_MAX_NOMINAL = {
    "rinon": 30.0,
    "higado": 10.0,
    "corazon": 5.0,
    "pulmon": 6.0,
    "pancreas": 15.0,
}

BASE_FEATURE_COLS = [
    "tiempo_transcurrido_h",
    "temp_interna_media", "temp_interna_std", "temp_interna_max", "temp_interna_tendencia",
]
FEATURE_COLS = BASE_FEATURE_COLS + [f"organo_{o}" for o in ORGANOS]


def _slope(y: np.ndarray) -> float:
    if len(y) < 2:
        return 0.0
    x = np.arange(len(y))
    return float(np.polyfit(x, y, 1)[0])


def build_features_for_case(df_caso: pd.DataFrame) -> pd.DataFrame:

    df_caso = df_caso.sort_values("step").reset_index(drop=True)
    filas = []
    for i in range(len(df_caso)):
        ini = max(0, i - WINDOW + 1)
        ventana = df_caso.iloc[ini:i + 1]

        fila = {
            "tiempo_transcurrido_h": df_caso.loc[i, "tiempo_transcurrido_h"],
            "temp_interna_media": ventana["temp_interna"].mean(),
            "temp_interna_std": ventana["temp_interna"].std(ddof=0) if len(ventana) > 1 else 0.0,
            "temp_interna_max": ventana["temp_interna"].max(),
            "temp_interna_tendencia": _slope(ventana["temp_interna"].to_numpy()),
            "organo": df_caso.loc[i, "organo"],
        }
        filas.append(fila)

    feats = pd.DataFrame(filas)
    for o in ORGANOS:
        feats[f"organo_{o}"] = (feats["organo"] == o).astype(int)
    return feats


def baseline_horas(organo: pd.Series, tiempo_transcurrido_h: pd.Series) -> pd.Series:
    t_max = organo.map(T_MAX_NOMINAL)
    return t_max - tiempo_transcurrido_h


def build_training_table(df_all: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series, pd.Series]:
    partes = []
    for _, df_caso in df_all.groupby("caso_id"):
        feats = build_features_for_case(df_caso)
        feats["horas_viables_restantes_real"] = df_caso.sort_values("step")["horas_viables_restantes"].to_numpy()
        partes.append(feats)
    tabla = pd.concat(partes, ignore_index=True)
    tabla["baseline"] = baseline_horas(tabla["organo"], tabla["tiempo_transcurrido_h"])
    X = tabla[FEATURE_COLS]
    y_residual = tabla["horas_viables_restantes_real"] - tabla["baseline"]
    baseline = tabla["baseline"]
    return X, y_residual, baseline


def features_from_readings(readings: list[dict], organo: str) -> tuple[pd.DataFrame, float]:
    df = pd.DataFrame(readings)
    df["step"] = range(len(df))
    df["organo"] = organo
    if "tiempo_transcurrido_h" not in df.columns:
        raise ValueError("Cada lectura debe incluir 'tiempo_transcurrido_h'")
    feats = build_features_for_case(df)
    ultima = feats.iloc[[-1]][FEATURE_COLS]
    baseline = float(baseline_horas(pd.Series([organo]), pd.Series([df["tiempo_transcurrido_h"].iloc[-1]])).iloc[0])
    return ultima, baseline


def features_from_telemetry(lecturas: list[dict], organo: str, extraido_en) -> tuple[pd.DataFrame, float]:
    df = pd.DataFrame(lecturas)
    if "timestamp" not in df.columns or "temperaturaC" not in df.columns:
        raise ValueError("Cada lectura debe incluir 'timestamp' y 'temperaturaC'")

    t0 = pd.Timestamp(extraido_en)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)
    df["tiempo_transcurrido_h"] = (df["timestamp"] - t0).dt.total_seconds() / 3600.0
    df["temp_interna"] = df["temperaturaC"]

    readings = df[["tiempo_transcurrido_h", "temp_interna"]].to_dict("records")
    return features_from_readings(readings, organo)