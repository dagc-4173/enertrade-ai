# ADR-27 — Pronóstico directo multi-horizonte de Oferta experimental

## Contexto

HU-04 tenía una capacidad productiva D+1 con `xm-gene-ridge@1.0.0`. El experimento V2 agregó lags, estadísticos móviles y calendario sobre el mismo corpus y particiones, y produjo siete candidatos técnicos. La familia de holdout ya había sido observada durante experimentos anteriores; por ello el resultado no constituye validación académica definitiva.

## Decisión

Oferta selecciona `xm-gene-ridge-direct-h{h}-v2` mediante:

`horizonDays = targetDate - latestObservationDate`

Solo se admiten `1 <= h <= 7`. No existe fallback silencioso a h1 y no se usa recursión. El origen es la última observación real de Gene; las features históricas se limitan a fechas menores o iguales al origen.

El loader valida identidad, horizonte, features, scaler, coeficientes, rangos, hash del corpus, métricas y candidatura `true` en `docs/evidencias/hu-04-multihorizon-v2/results.json`. Un artefacto inválido, ausente o no candidato produce fallo cerrado. `xm-gene-ridge@1.0.0` permanece disponible como artefacto histórico/productivo anterior.

La respuesta de Oferta incluye `forecastOriginDate`, `targetDate`, `horizonDays`, `modelId`, `modelVersion`, `modelStatus: experimental` y `academicValidation: pending`, además de procedencia y 24 predicciones. Las métricas corresponden al horizonte seleccionado.

## Por qué directo y no recursivo

La recursión introduciría predicciones previas como observaciones/features, acumularía error y rompería la distribución de entrenamiento. Cada artefacto V2 aprende directamente `X(t) -> y(t+h)` usando observaciones reales hasta `t`.

## Consecuencias

- Oferta admite experimentalmente D+1..D+7.
- Fuera de ese rango responde `FORECAST_HORIZON_NOT_SUPPORTED`.
- La gráfica muestra observaciones hasta el origen y solo el target solicitado; no inventa días intermedios.
- Demanda y Precio conservan sus contratos D+1 sin cambios.
- No se modifica Prisma ni el modelo productivo anterior.
- La candidatura técnica no implica validación académica, generalización universal, oferta comercial real ni equivalencia con generación PV.

## Pendientes

Se requiere revisión académica independiente y, preferiblemente, un holdout completamente virgen antes de presentar V2 como modelo formalmente validado. La integración debe considerarse experimental y reversible.
