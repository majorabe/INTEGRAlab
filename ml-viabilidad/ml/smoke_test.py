import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.append(os.path.dirname(__file__))
from features import features_from_telemetry, T_MAX_NOMINAL  # noqa: E402
import joblib

MODEL_PATH = os.path.join(os.path.dirname(__file__), "modelo_viabilidad.joblib")
bundle = joblib.load(MODEL_PATH)
modelo = bundle["modelo"]

extraido_en = datetime(2026, 8, 25, 9, 0, 0, tzinfo=timezone.utc)  # hora de extraccion
t_inicio_lecturas = extraido_en + timedelta(hours=1)  # empezamos a leer 1h despues


def serie(temps):
    return [
        {"timestamp": (t_inicio_lecturas + timedelta(minutes=5 * i)).isoformat(), "temperaturaC": t}
        for i, t in enumerate(temps)
    ]


lecturas_normales = serie([4.1, 4.3, 3.9, 4.0, 4.2, 4.1])
lecturas_falla = serie([4.0, 8.0, 13.0, 18.0, 21.0, 22.0])

for nombre, lecturas in [("SIN falla (temp estable ~4C)", lecturas_normales),
                          ("CON falla (temp sube 4C -> 22C)", lecturas_falla)]:
    X, baseline = features_from_telemetry(lecturas, "rinon", extraido_en)
    residual = float(modelo.predict(X)[0])
    horas_viables = baseline + residual
    print(f"\n--- {nombre} ---")
    print(f"  baseline (solo reloj, riñon={T_MAX_NOMINAL['rinon']}h):  {baseline:.2f} h")
    print(f"  ajuste aprendido por el modelo (temperatura):            {residual:+.2f} h")
    print(f"  horas viables restantes estimadas:                       {horas_viables:.2f} h")