# HU-05 — Consultar métricas del modelo de oferta

## Alcance

GET /forecasts/supply/metrics expone la evaluación conservada exclusivamente del
modelo activo xm-gene-ridge@1.0.0. Endpoint técnico implementado; sin frontend
avanzado. Validación académica/formal pendiente.

No admite body ni parámetros de consulta para seleccionar modelo/versiones.
La identidad y los rangos proceden del mismo loadModel() usado por HU-04.
evaluation.json se carga desde ruta fija, se valida y se congela en memoria;
no se recalculan métricas en runtime ni se consulta Prisma o XM. No hay escritura
de datos ni entrenamiento. model.json permanece intacto.

## Semántica y resultados

| Métrica | Definición | Valor | Unidad |
| --- | --- | ---: | --- |
| MAE | Error absoluto medio | 329144.1790612068 | kWh |
| RMSE | Raíz del error cuadrático medio | 438880.23646857974 | kWh |
| bias | Error medio firmado (predicción menos real) | -17643.615971800806 | kWh |
| WAPE | Error porcentual absoluto ponderado del holdout fijo | 3.4778347681971216 | percent |

Holdout: 2024-03-31..2024-04-29, 720 evaluables, cero indisponibles.
WAPE y sus sumas proceden de la [evidencia reproducible](../hu-05-metricas/README.md);
no representan otra instancia Ridge ni generalización fuera del holdout.
No se acredita evaluación anual. generation_availability_proxy es generación XM
como proxy técnico de disponibilidad, no oferta transaccional real.

## Contrato

HTTP 200 devuelve status=available, modelId/version, active=true, forecastType,
target=energia_kwh, unit=kWh y horizonPeriods=24.

training incluye trainedAt=null y trainedAtStatus=not_recorded porque no existe
registro histórico de fecha/hora de entrenamiento; no se infiere de Git ni rangos.
Incluye snapshotSha256, sourceRange 2024-01-01..2024-03-30 y effectiveRange
2024-01-08..2024-03-30.

evaluation incluye type=external_temporal_holdout, range, snapshotSha256,
evaluable/unavailable, MAE/RMSE/bias como objetos value/unit y percentageError
con metric=WAPE, value y unit=percent. Numerador y denominador permanecen en
el artefacto, sin exponerse por HTTP. No se publican rutas locales ni coeficientes.

Hash entrenamiento:
`4c91a20048d90d082f8eec6c770f4bd042e479d70df7ca020e8dd3a6b3ba0177`.
Hash holdout:
`9fdb41321a46f2b027b3578ebb0eca9894100653644bff6401ae901aeced9182`.

Modelo/evaluación ausentes o inválidos: HTTP 409, status=unavailable,
FORECAST_MODEL_INCOMPATIBLE y mensaje seguro. Error inesperado: HTTP 500
FORECAST_FAILED. Body o query no admitidos: HTTP 400 INVALID_FORECAST_REQUEST.
Los fallos de lectura/validación de artefactos se conservan hasta reiniciar.

[Pruebas ejecutadas](pruebas.md). El endpoint satisface la consulta técnica de
métricas disponibles; la fecha histórica de entrenamiento sigue sin evidencia.
