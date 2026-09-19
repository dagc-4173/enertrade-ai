# HU19 - Indicadores generales del motor IA

## Endpoint y fórmulas

`GET /indicators` publica pronósticos supply/demand exitosos desde `AiQueryTrace`, precios exitosos desde `PriceForecastExecution`, suma de `matches` desde `MatchingExecution` y suma de `patterns` desde `PatternAnalysis`. Errores y promedio provienen de trazas, excluyendo `engine_indicators`; `empty` solo cuenta para muestra/duración y `failed` solo para errores/duración. Las capacidades activas reutilizan HU18.

Sin trazas responde 200 con ceros, promedio `null`, `NO_TRACE_DATA` y `NO_FUNCTIONAL_RECORDS`. No hay umbral arbitrario. El endpoint es público en MVP: RBAC pendiente.

## Integración PostgreSQL

Se ejecutó una integración temporal con tres trazas (supply exitoso, demand exitoso y error), una ejecución de precio exitosa, dos sugerencias de matching y tres patrones. `GET /indicators` respondió HTTP 200 con `X-Request-Id` y los incrementos esperados; creó la traza HU17 `engine_indicators` con estado `succeeded`. Se eliminaron por UUID todas las filas temporales, incluida esa traza, y los conteos finales de las cuatro tablas quedaron iguales a los iniciales.

## Límites

No hay tabla KPI, históricos inventados, dashboard ni agregación programada. La traza es best-effort y puede subregistrar. La suma de sugerencias y patrones usa arrays JSONB persistidos.