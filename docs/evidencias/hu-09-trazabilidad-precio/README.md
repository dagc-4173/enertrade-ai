# HU-09 — Trazabilidad de estimaciones de precio

## Objetivo y alcance

Comprobar que cada intento de estimación HU-08 conserva condiciones, entradas,
motor, resultado y estado en PriceForecastExecution sin alterar B1. Decisión:
[ADR-13](../../adr/ADR-13-trazabilidad-estimaciones-precio.md).
Implementación versionada en `1cc32465732c6f3e7a5fe7bf6c83299b9c27bc72`.
Validación académica/formal pendiente.

Se ejecutó la aplicación Express real mediante app.ts en un puerto efímero
localhost, con Prisma y PostgreSQL Neon reales, sin mocks. Un script temporal
por stdin realizó las peticiones HTTP y lecturas de contraste; no se modificó
código funcional. Se conservaron los registros anteriores y las tres trazas
nuevas. No se consultó XM ni se reaplicaron migraciones.

## Estado previo y delimitación

| Tabla | Antes | Después |
| --- | ---: | ---: |
| EnergyDataset | 40 | 40 |
| PreparedDataset | 39 | 39 |
| PriceForecastExecution | 2 | 5 |

Las trazas previas, excluidas expresamente de esta validación nueva, son:

- `51fc82bb-e897-4b2f-bcc8-796ea4fef709`.
- `2cd9dd1f-3863-4293-8644-4c577da4616d`.

El dataset 69 permaneció intacto y no se usó. No se atribuye autoría a ese
dataset, las trazas previas o la aplicación anterior de la migración.

Marca de inicio UTC obtenida con SELECT clock_timestamp(), inmediatamente antes
de los POST: **2026-09-16T12:09:30.077Z**. Se comprobó que createdAt de cada
nueva fila fuera posterior a esa marca y que los UUID no pertenecieran al
conjunto histórico.

## Pruebas reales nuevas

Precondición común: PreparedDataset 49, sourceDatasetId 68, perfil
xm_preciobolsnaci_preparacion_base@1.0.0 y ruleset
xm_preciobolsnaci_base@1.0.0. Sus 720 observaciones coincidieron con el CSV
versionado del holdout antes de las llamadas.

| ID | Acción | Resultado esperado | Resultado obtenido | Estado |
| --- | --- | --- | --- | --- |
| HU09-INT-01 | POST /forecasts/price con preparado 49 y targetDate 2024-09-29 | 200, 24 precios, trace persistido y partial | HTTP 200; nueva fila succeeded; paridad de entradas y salida exacta | Probado |
| HU09-INT-02 | Leer preparado 2147483647 para confirmar ausencia; POST con ese ID y fecha válida | 404, código seguro y nueva traza failed sin FK inválida | HTTP 404 PREPARED_DATASET_NOT_FOUND; fila failed, FK/resultPayload null | Probado |
| HU09-INT-03 | Repetir exactamente HU09-INT-01 | Resultado técnico idéntico y UUID distinto | HTTP 200; segunda fila succeeded independiente | Probado |
| HU09-INT-04 | Comparar tablas fuente y trazas previas antes/después | Sin modificación de datos anteriores; tres trazas adicionales | Igualdad estructural completa; conteos 40/39/5 | Probado |

UUID nuevos:

| Caso | executionId |
| --- | --- |
| Éxito | `1fbd029a-21e9-4322-ae1b-7838d7511eed` |
| Error 404 | `fb72e81b-1d51-418c-b3d4-1990f43239c9` |
| Éxito repetido | `333e0477-7381-425c-95a4-d672141467f5` |

Fechas leídas de PostgreSQL (UTC):

| Caso | createdAt | completedAt |
| --- | --- | --- |
| Éxito | 2026-09-16T12:09:30.891Z | 2026-09-16T12:09:31.081Z |
| Error 404 | 2026-09-16T12:09:31.255Z | 2026-09-16T12:09:31.413Z |
| Repetición | 2026-09-16T12:09:31.569Z | 2026-09-16T12:09:31.726Z |

## Contrato HTTP y contraste persistido

Petición exitosa y repetición:

```json
{"preparedDatasetId":49,"targetDate":"2024-09-29"}
```

Ambos resultados técnicos fueron idénticos, con status available,
sourceDatasetId=68, forecastType=market_reference_price, target=precio_cop_kwh,
unit=COP/kWh, granularity=hourly, horizonDays=1 y regla
xm-preciobolsnaci-b1@1.0.0 de tipo deterministic_baseline.

Precios observados, en orden de periodo 1..24, COP/kWh:

```text
915.15174, 889.15174, 888.01774, 888.01774, 889.15174, 889.15174,
889.15174, 889.15174, 889.15174, 889.15174, 889.15174, 934.61174,
889.15174, 934.61174, 934.62274, 934.62374, 934.62374, 934.62474,
934.62574, 934.62574, 934.62574, 934.62474, 934.62374, 934.62274
```

trace indicó UUID no nulo, persistence=persisted y
conditionsCompleteness=partial. Las filas se leyeron por los UUID devueltos:
status=succeeded, httpStatus=200, errorCode=null, targetDate=2024-09-29,
preparedDatasetId=49, ruleId/version/type correctos y completedAt no null.
requestPayload coincidió exactamente con la petición permitida.

inputSnapshot conservó sourceDatasetId=68, preparedDatasetId=49,
referenceDate=2024-09-28 y 24 values ordenados por periodo. Cada sourceRecordIndex,
periodo y precio coincidió exactamente con la fila correspondiente de
PreparedDataset 49 (sourceRecordIndex 696..719). No se recalculó el pronóstico
para sustituir esta comparación.

resultPayload fue estructuralmente idéntico a la respuesta HTTP tras excluir
únicamente trace. referenceDate/sourceDate no forman parte de ese objeto técnico
en el contrato actual: referenceDate está en inputSnapshot. No se añadió un campo
HTTP ficticio para la prueba.

Factores usados: previous_day_same_period_price. partialReasons y factores
omitidos coincidieron exactamente con:

- commercial_supply;
- commercial_demand;
- generation_forecast;
- demand_forecast.

scope permaneció referencePrice=true, personalized=false,
financialSettlement=false y commercialNegotiation=false. partial describe esos
factores omitidos; no representa periodos faltantes ni un error técnico.

Para el error, se verificó previamente mediante findUnique que 2147483647 no
existía. La respuesta fue HTTP 404, PREPARED_DATASET_NOT_FOUND y mensaje
`Dataset preparado no encontrado.` con trace persistido. La fila conservó
requestPayload con el ID solicitado y targetDate, status=failed, httpStatus=404,
errorCode=PREPARED_DATASET_NOT_FOUND, preparedDatasetId=null,
resultPayload=null y completedAt no null.

## Integridad y límite del hash histórico

Las lecturas completas antes/después de EnergyDataset y PreparedDataset fueron
estructuralmente iguales, incluidas fechas, estados, informes y contenido. Las
dos trazas previas también permanecieron iguales. Se repitió el contraste de
las 720 observaciones del preparado 49 contra
`../hu-08-precio/external-holdout/preciobolsnaci-2024-07-31_2024-09-28.csv`,
seleccionando 2024-08-30..2024-09-28 y verificando sourceRecordIndex 0..719.

El hash histórico
`62bb2038da79293b22af9355f1b5519997230f49a3a7df42de2caf568301b1ad`
correspondía a una representación canónica de la fila completa. No se pudo
reproducir durante la revisión previa y no se utiliza como prueba de identidad
porque la rutina exacta de canonicalización de HU-08 no quedó versionada.
Esto no demuestra modificación de la fila ni invalidez del hash histórico.
Para HU-09, la integridad se verificó mediante contraste estructural y de las
720 observaciones: fecha, periodo, precio y sourceRecordIndex coincidieron.
La integración nueva no modificó PreparedDataset 49. No se intentó reconstruir
datos ni reemplazar ese hash.

## Pruebas automatizadas y migraciones

Después de las tres solicitudes reales:

| Comando | Resultado observado |
| --- | --- |
| bun test | 481 aprobadas, 0 fallidas, 1549 aserciones, 10 archivos |
| bun x tsc --noEmit | Correcto, salida 0 |
| git diff --check | Correcto; aviso de conversión LF/CRLF, sin error de whitespace |
| bun --bun run prisma migrate status | 4 migraciones aplicadas, 0 pendientes; Database schema is up to date! |

La migración HU-09 `20260916000000_add_price_forecast_execution_trace` ya estaba
aplicada; no se ejecutó migrate deploy/dev ni db push. La entidad específica
almacena request/input/result JSON, estados pending/succeeded/failed, completitud,
HTTP/código seguro, fechas y FK nullable con RESTRICT/CASCADE; cuatro índices
por createdAt, status, targetDate y preparedDatasetId.

La suite automatizada usa persistencia sustituida para probar fallos de start,
complete y failExecution: la respuesta técnica o el error original se conserva.
No se provocó indisponibilidad, pérdida de permisos ni corrupción real de
PostgreSQL. Esta cobertura se distingue de los POST 200/404/200 reales y de la
evidencia histórica previa.

## Estado final y limitaciones

HU-09 implementada y versionada en backend, migración aplicada previamente;
éxito, error 404 y repetición probados en integración real nueva. Regresión
backend aprobada. Fallos de persistencia probados mediante sustitución.
HU-08 conserva el resultado técnico B1. Validación académica/formal pendiente.

No hay endpoint de historial, frontend HU-09, reconciliación de pending ni
idempotencia por contenido. Una caída puede dejar pending y un fallo de creación
puede impedir conservar el intento. No hay garantía de disponibilidad continua.
No se afirma negociación comercial o liquidación financiera.

Este README conserva resultados observados; no afirma existencia de capturas,
HAR o logs versionados adicionales. No se atribuye autoría de la migración,
las dos trazas anteriores ni el dataset 69. No se hizo commit de esta evidencia.
