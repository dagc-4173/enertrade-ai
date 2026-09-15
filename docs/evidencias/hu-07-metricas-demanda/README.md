# HU-07 — Consultar métricas del modelo de demanda

## Objetivo y estado

HU-07 permite consultar el desempeño asociado al modelo activo de HU-06. Implementada y probada mediante HTTP local automatizado; validación académica/formal pendiente. No se implementó frontend.

GET /forecasts/demand/metrics no admite body, query params ni selección de modelo. Devuelve status=available, modelId=xm-demandasin-ridge, modelVersion=1.0.0, active=true, forecastType=aggregate_demand_proxy, target=demanda_kwh, unit=kWh y horizonDays=1.

## Fuente de verdad

La respuesta proyecta exclusivamente el model.json productivo validado por el loader existente. No se crea evaluation.json ni una segunda fuente de métricas. B1/B7 permanecen como comparación en el artefacto; las métricas principales expuestas corresponden únicamente a Ridge.

Se añadieron trainedAt=null y trainedAtStatus=not_recorded al artefacto, siguiendo la semántica explícita de HU-05. No se infiere una fecha desde Git, archivos, rangos o ejecución. También se explicitó la identidad de evaluación (modelo, versión, tipo, rango y hash), que el loader contrasta con el modelo. No se alteraron coeficientes, escalado, intercepto ni métricas del experimento.

Entrenamiento fuente: 2023-08-01..2024-07-30. Rango efectivo: 2023-08-29..2024-07-30; 337 filas.

SHA-256 entrenamiento: `73e795ae04e4dd36e1dff7fda38e47627514602565ee086b2710f1c6da6c807f`.

## Evaluación expuesta

Tipo external_temporal_holdout; rango 2024-07-31..2024-09-28, 60 evaluables y 0 indisponibles.

SHA-256 holdout: `ddb2b802941ae82230d9fbe0dee1847cdbaa12d986f0af460cf54a6376fd8eaa`.

| Métrica | Valor | Unidad |
|---|---:|---|
| MAE | 5140961.018887941 | kWh |
| RMSE | 6644945.165229929 | kWh |
| bias | -1246487.8464061364 | kWh |
| WAPE | 2.2583614453366287 | percent |

MAE, RMSE y bias se devuelven como objetos value/unit. percentageError contiene metric=WAPE, value y unit=percent. WAPE no es accuracy ni un porcentaje de exactitud; no se calculan MAPE/sMAPE.

## Alcance y efectos

Scope: aggregation=SIN, personalized=false, zonalFallback=false, confidenceStatus=not_defined. DemaSIN representa demanda agregada del SIN, no consumo individual ni zonal. Personalización, fallback zonal y confidence no están implementados. Estas limitaciones no son errores HTTP.

El servicio solo proyecta valores almacenados: sin Prisma, PreparedDataset, XM, entrenamiento ni nueva evaluación. El loader conserva sus comprobaciones aritméticas de coherencia sobre métricas guardadas, una vez por carga; esto no vuelve a generar predicciones ni recalcula el desempeño desde datos.

Modelo inválido/ausente: 409 con status=unavailable y FORECAST_MODEL_INCOMPATIBLE. Body/query: 400 INVALID_FORECAST_REQUEST. Error inesperado: 500 FORECAST_FAILED, sin detalles internos. POST /forecasts/demand/metrics no está registrado y devuelve 404.

## Pruebas ejecutadas

Comandos desde D:\Proyectos\backend para respetar la configuración local, sin exponer secretos:

- bun test src/tests/demand-forecast-metrics.test.ts: 23 aprobadas, 0 fallidas, 50 aserciones.
- bun test: 372 aprobadas, 0 fallidas, 1164 aserciones; incluye HU-04/HU-05/HU-06.
- Typecheck backend correcto tras anotar explícitamente callbacks de prueba.

La prueba HTTP comprueba el contrato exacto contra valores conocidos del artefacto, alcance, identidad y campos de entrenamiento. Casos negativos cubren body/query, POST, ausencia/corrupción, métricas no finitas, denominador WAPE e identidad incoherentes. Se verifican caché e inmutabilidad.

Prisma está sustituido por funciones que fallan si se invocan. La prueba de dependencias confirma que el servicio importa solo el loader y no incorpora fetch, Prisma, preparación, entrenamiento ni operaciones de cálculo de métricas. La comparación con el artefacto experimental confirma parámetros y métricas intactos. No se consultó XM/PostgreSQL en este incremento.

No se afirma generalización fuera del holdout ni estabilidad anual. Esta proyección sigue ADR-11 y no requiere una nueva decisión arquitectónica ni ADR-12. Sin commit.
