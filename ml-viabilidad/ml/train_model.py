import sys
import os
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import mean_absolute_error, r2_score

sys.path.append(os.path.dirname(__file__))
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "data"))

from features import build_training_table, FEATURE_COLS, T_MAX_NOMINAL  # noqa: E402

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "traslados_sinteticos.csv")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "modelo_viabilidad.joblib")


def cargar_datos() -> pd.DataFrame:
    if not os.path.exists(DATA_PATH):
        from generate_synthetic_data import generar_dataset
        df = generar_dataset()
        df.to_csv(DATA_PATH, index=False)
    return pd.read_csv(DATA_PATH)


def main():
    print("Cargando datos...")
    df = cargar_datos()

    print("Construyendo features de series de tiempo (ventana movil)...")
    X, y_residual, baseline = build_training_table(df)

    caso_ids = df.sort_values(["caso_id", "step"]).groupby("caso_id").ngroup().values

    grupos = []
    for cid, g in df.groupby("caso_id"):
        grupos.extend([cid] * len(g))
    grupos = np.array(grupos)

    splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
    train_idx, test_idx = next(splitter.split(X, y_residual, groups=grupos))
    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    yres_train, yres_test = y_residual.iloc[train_idx], y_residual.iloc[test_idx]
    base_test = baseline.iloc[test_idx]

    print(f"Train: {len(X_train)} filas | Test: {len(X_test)} filas (split por traslado completo, sin fuga de datos)")

    modelo = GradientBoostingRegressor(
        n_estimators=300,
        max_depth=3,
        learning_rate=0.05,
        subsample=0.8,
        random_state=42,
    )
    print("Entrenando GradientBoostingRegressor sobre el RESIDUAL (desviacion vs. linea base por reloj)...")
    modelo.fit(X_train, yres_train)

    resid_pred = modelo.predict(X_test)
    pred_final = base_test.to_numpy() + resid_pred          # prediccion reconstruida (horas reales)
    y_test_final = base_test.to_numpy() + yres_test.to_numpy()

    mae_modelo = mean_absolute_error(yres_test, resid_pred)
    mae_final = mean_absolute_error(y_test_final, pred_final)
    mae_baseline_solo = mean_absolute_error(y_test_final, base_test)  # si no usaramos ML en absoluto
    r2_final = r2_score(y_test_final, pred_final)

    print(f"\nResultados en test (traslados nunca vistos por el modelo):")
    print(f"  MAE del residual aprendido por el modelo: {mae_modelo:.2f} horas")
    print(f"  MAE final (baseline + correccion ML):     {mae_final:.2f} horas")
    print(f"  MAE si solo usaramos la linea base (sin ML, ignorando sensores): {mae_baseline_solo:.2f} horas")
    print(f"  R^2 de la prediccion final: {r2_final:.3f}")
    print(f"  -> El ML reduce el error un {(1 - mae_final / mae_baseline_solo) * 100:.1f}% respecto a solo usar el reloj,")
    print(f"     precisamente por leer temperatura/bateria/velocidad en tiempo real.")

    importancias = pd.Series(modelo.feature_importances_, index=FEATURE_COLS).sort_values(ascending=False)
    print("\nImportancia de variables PARA EL RESIDUAL (qué mira el modelo para ajustar la línea base):")
    print(importancias.to_string())

    joblib.dump({
        "modelo": modelo,
        "feature_cols": FEATURE_COLS,
        "t_max_nominal": T_MAX_NOMINAL,
    }, MODEL_PATH)
    print(f"\nModelo guardado en: {MODEL_PATH}")


if __name__ == "__main__":
    main()
