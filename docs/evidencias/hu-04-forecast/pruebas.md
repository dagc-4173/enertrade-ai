# HU-04 — Pruebas técnicas

## Procedencia

Resultados ejecutados previamente en esta sesión y confirmados por el usuario
para este cierre documental. Script temporal por stdin, aplicación Express real,
Prisma/PostgreSQL reales y modelo del servidor. No se repitió la ejecución en
esta actualización documental. No se adjuntan capturas, HAR ni archivos de logs
no guardados; no se atribuye una fecha de ejecución no conservada.
Los IDs HU04-INT siguientes organizan la evidencia; los IDs de base de datos
sí corresponden a los registros observados.

Precondición común: PreparedDataset 17 existente, fuente EnergyDataset 36,
perfil xm_gene_preparacion_base@1.0.0, 720 registros; modelo xm-gene-ridge@1.0.0.
No se consultó XM, no se entrenó y no se crearon ni eliminaron datasets.

## HU04-INT-01 — Respuesta disponible

- **Acción:** POST /forecasts/supply con
  `{"preparedDatasetId":17,"targetDate":"2024-04-08"}`.
- **Esperado:** HTTP 200, available, modelo y procedencia correctos, 24 predicciones finitas.
- **Obtenido:** HTTP 200, status=available, preparedDatasetId=17,
  sourceDatasetId=36, modelId=xm-gene-ridge, modelVersion=1.0.0,
  forecastType=generation_availability_proxy, target=energia_kwh, unit=kWh,
  horizonPeriods=24, targetDate=2024-04-08. Periodos exactamente 1..24 ordenados.
- **Estado:** Probado técnicamente, esperado cumplido.

| Resumen | kWh |
| --- | ---: |
| Periodo 1 | 8480559.56339466 |
| Periodo 24 | 9173742.924577693 |
| Mínimo | 8030058.92838138 |
| Máximo | 10612340.93991098 |
| Media auxiliar | 9516684.508983593 |

La media es solo un resumen numérico; no reinterpreta generación como oferta transaccional.

## HU04-INT-02 — Paridad independiente

- **Precondición:** respuesta de INT-01 y PreparedDataset 17 leído mediante SQL.
- **Acción:** recalcular los 24 resultados con model.json del servidor, búsquedas
  explícitas de 2024-04-07 y 2024-04-01 y fórmula documentada. El cálculo independiente
  no reutilizó forecast.service.ts. Comparar una a una las salidas HTTP.
- **Esperado:** diferencia absoluta máxima < 1e-7 kWh.
- **Obtenido:** 24 diferencias iguales a cero; máximo **0 kWh**.
- **Estado:** Probado técnicamente. Es paridad de esta integración, distinta de
  la referencia TypeScript/Python automatizada; no afirma igualdad universal entre runtimes.

## HU04-INT-03 — Ausencia de escrituras

- **Acción:** capturar antes y después del conjunto de solicitudes conteos y
  hashes SHA-256 de todas las filas de cada tabla pública. Serialización de cada
  fila mediante row_to_json, textos ordenados y unidos con LF antes del hash.
- **Esperado:** ninguna fila nueva ni cambios de contenido.
- **Obtenido:** conteos y hashes idénticos. PreparedDataset 17, datasets fuente,
  estados, validationReport y validatedAt intactos. El schema actual no tiene updatedAt.
- **Estado:** Probado técnicamente por comparación de estado antes/después;
  no se presenta como auditoría transaccional de cada sentencia SQL.

| Tabla | Antes | Después |
| --- | ---: | ---: |
| EnergyDataset | 7 | 7 |
| PreparedDataset | 7 | 7 |
| _prisma_migrations | 3 | 3 |

## Casos negativos reales

Precondición: misma aplicación/modelo. Para cada caso se envió POST /forecasts/supply
con el ID y fecha indicados; la captura INT-03 cubre también estas solicitudes.

| ID de prueba | PreparedDataset | targetDate | Esperado y obtenido | Estado |
| --- | ---: | --- | --- | --- |
| HU04-INT-04 | 17 | 2024-03-30 | HTTP 422 FORECAST_DATE_NOT_SUPPORTED | Probado |
| HU04-INT-05 | 17 | 2024-03-31 | HTTP 422, status=unavailable, FORECAST_DATA_INSUFFICIENT | Probado |
| HU04-INT-06 | 2147483647 | 2024-04-08 | HTTP 404 PREPARED_DATASET_NOT_FOUND | Probado |
| HU04-INT-07 | 5 | 2024-04-08 | HTTP 422 FORECAST_PROFILE_NOT_APPLICABLE | Probado |

El 2024-03-31 supera el cierre de entrenamiento; por tanto pasa esa restricción,
pero no tiene D−1/D−7 dentro del preparado 17. La ausencia del ID 2147483647 se
comprobó previamente en PostgreSQL. El preparado simulado 5 ya existía y se usó
sin modificarlo; no se creó uno para la prueba.

## Pruebas automatizadas y comprobaciones finales previas

| Comprobación ejecutada | Resultado |
| --- | --- |
| bun test, backend completo | 234 aprobadas, 0 fallidas, 909 aserciones |
| HU-04 aislada | 47 aprobadas |
| Paridad automatizada TS/Python | 24 predicciones, diferencia absoluta < 1e-7 kWh |
| Typecheck backend | Correcto |
| git diff --check | Correcto |

Suite: [forecast.test.ts](../../../backend/src/tests/forecast.test.ts), con lectura
sustituida; complementa la integración real descrita arriba. No acredita por sí
misma acceso PostgreSQL. El fallo inicial de parametrización del caso [] se corrigió
en la implementación anterior; los resultados de esta tabla son los finales.

## Cierre técnico

HU-04 implementada y probada técnicamente en backend. Modelo congelado, inferencia
de solo lectura, sin persistencia de predicciones ni entrenamiento en runtime.
Sin frontend HU-04 ni evaluación anual. Esta integración no prueba generalización
fuera del periodo ni equivalencia con ofertas transaccionales reales.
**Validación académica/formal pendiente.**
