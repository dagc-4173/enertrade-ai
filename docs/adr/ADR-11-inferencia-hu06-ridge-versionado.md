# ADR-11 — Inferencia HU-06 con Ridge versionado

## Estado y contexto

Decisión adoptada. Primera inferencia backend implementada; validación académica/formal pendiente. ADR-10 delimitó DemaSIN como demanda agregada del SIN. Sus pendientes de adquisición, preparación y experimentación avanzaron: corpus anual y holdout externo conservados, con Ridge seleccionado por una regla fijada antes de evaluar el holdout. No se reinterpretan como demanda individual ni zonal.

La especificación alpha=100, rezagos D-1/D-7/D-14/D-28 y seno/coseno del weekday cumplió los cinco criterios de promoción. MAE externo 5140961.018887941 kWh; RMSE 6644945.165229929 kWh; WAPE 2.2583614453366287 %. La mejora relativa de MAE frente B7 fue 3.673806810082002 %. El bias negativo permanece como limitación; un holdout no demuestra estabilidad general.

## Alternativas y decisión

- Entrenar en runtime: descartado por falta de reproducibilidad y cambio de modelo por petición.
- Cargar artefactos elegidos por el cliente: descartado; la versión activa es fija en servidor.
- Buscar automáticamente historia en múltiples preparados: pospuesto para conservar procedencia inequívoca en v1.
- Adoptar un artefacto fijo validado y de solo lectura: opción implementada.

Modelo activo: xm-demandasin-ridge@1.0.0, bajo backend/src/models/xm-demandasin-ridge/1.0.0/model.json. Parámetros completos copiados del experimento external-holdout/ridge-model.json sin modificarlo ni redondearlos. Loader específico: valida estructura, parámetros, rangos, hashes, compatibilidad y coherencia del resumen de evaluación; cachea éxito/fallo y congela el objeto. No comparte las restricciones específicas del loader Gene.

## Contrato y protocolo

POST /forecasts/demand acepta exactamente preparedDatasetId y targetDate, JSON y límite 16 KiB. El ID debe ser entero positivo hasta 2147483647; fecha calendario YYYY-MM-DD. Respuesta available con procedencia, forecastType=aggregate_demand_proxy, target=demanda_kwh, unit=kWh, horizonDays=1, identidad del modelo, targetDate y prediction.demanda_kwh. Confidence=null y confidenceStatus=not_defined: no se derivan porcentajes ni intervalos de las métricas.

La fecha objetivo debe ser posterior a trainingSourceRange.end=2024-07-30. Entrenamiento fuente 2023-08-01..2024-07-30, efectivo 2023-08-29..2024-07-30 (337 filas). Esta restricción no confunde el fin de entrenamiento con el fin del holdout.

Se lee un solo PreparedDataset con perfil xm_demandasin_preparacion_base@1.0.0 y ruleset xm_demandasin_base@1.0.0. Se vuelve a comprobar contenido, variables, fechas únicas y valores finitos. No se exige continuidad global: bastan las cuatro referencias D-1/D-7/D-14/D-28 dentro del mismo preparado. Se presupone disponibilidad completa de esos días al origen.

Weekday calendario lunes=0..domingo=6. Features en orden: demanda D-1, D-7, D-14, D-28, sin(2*pi*weekday/7), cos(2*pi*weekday/7). La aritmética calendario no asigna timestamps a observaciones. Inferencia: intercepto + suma(coeficiente*(feature-media)/desviación), con scaler poblacional ddof=0 fijado durante entrenamiento. Sin imputación, redondeo ni truncado de negativos; salida no finita es fallo seguro.

## Errores y efectos

Se reutilizan ForecastError y sus envelopes: 400 INVALID_FORECAST_REQUEST; 404 PREPARED_DATASET_NOT_FOUND; 422 FORECAST_PROFILE_NOT_APPLICABLE, FORECAST_DATA_INSUFFICIENT y FORECAST_DATE_NOT_SUPPORTED; 409 PREPARED_DATASET_INCONSISTENT y FORECAST_MODEL_INCOMPATIBLE; 500 FORECAST_FAILED. Historia insuficiente incluye status=unavailable. Se conservan 413/415 del parser. Precedencia: petición, modelo, frontera temporal, lectura, perfil, contenido, referencias e inferencia.

Prisma solo lectura; no prepareDataset, XM, entrenamiento ni persistencia de predicciones. POST /supply y GET /supply/metrics conservan sus contratos.

## Verificación y pendientes

Fixtures congelados calculados independientemente con Python stdlib desde parámetros completos y valores del snapshot atribuidos al preparado 33. Las fechas se remapean explícitamente para probar lunes, cambio de año y bisiesto; no son nuevas observaciones XM. Tolerancia absoluta de paridad TS/Python: menor que 1e-7 kWh.

La integración HTTP con PostgreSQL real del nuevo endpoint permanece pendiente. Caso propuesto: preparado 33, objetivo 2024-09-29, referencias 2024-09-28/22/15 y 2024-09-01. No requiere múltiples preparados.

Pendientes: frontend HU-06, personalización, fallback zonal, definición/evaluación de confidence, actualización controlada de versiones y evaluación temporal adicional. Un año no demuestra estacionalidad anual repetible. Implementación técnica del proxy agregado no cierra todos los criterios originales por usuario/zona.
