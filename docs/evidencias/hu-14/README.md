# Evidencia tecnica — HU-14: Exponer API de resultados del motor IA

## Estado

| Dimension | Estado |
| --- | --- |
| Backend HU-14 | Implementado |
| Pruebas tecnicas | Probado tecnicamente |
| Validacion academica/formal | Pendiente |
| Despliegue | Pendiente |

## Contratos disponibles

| Resultado | Endpoint | Entrada | Sin resultado / errores principales | Evidencia |
| --- | --- | --- | --- | --- |
| Generacion | `POST /forecasts/supply` | `preparedDatasetId`, `targetDate` | 404 preparado; 422 datos insuficientes; 409 inconsistencia | `forecast.test.ts` |
| Demanda | `POST /forecasts/demand` | `preparedDatasetId`, `targetDate` | 404 preparado; 422 datos insuficientes; 409 inconsistencia | `demand-forecast.test.ts` |
| Precio | `POST /forecasts/price` | `preparedDatasetId`, `targetDate` | 404 preparado; 422 datos insuficientes; 409 regla/contenido | `price-forecast.test.ts` |
| Matching | `POST /matches/suggest` | cuerpo vacio | 200 `no_matches`; 400 contrato; 500 seguro | `matching.test.ts`, `matching-trace.test.ts` |
| Patrones | `POST /patterns/analyze`, `GET /patterns` | ID preparado; filtros de rango/tipo/variable | 200 `no_results` o `[]`; 400 contrato; 404 preparado | `pattern-analysis.test.ts`, `patterns.test.ts` |

Las respuestas son JSON estructurado y conservan contratos propios; no se forzo un envelope global. Los forecasts y catalogo son publicos; Matching y Patterns requieren autenticacion. Los cuerpos, IDs, fechas, tipos, campos extra, JSON malformado, limites y Content-Type se validan segun cada ruta.

No se implemento OpenAPI ni Swagger: HU-14 se acredita mediante contratos de codigo, pruebas y evidencia de las HUs de resultado.