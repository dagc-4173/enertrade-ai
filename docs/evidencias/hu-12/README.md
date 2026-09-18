# Evidencia tecnica — HU-12: Reconocer patrones energeticos

## Estado

| Dimension | Estado |
| --- | --- |
| Backend HU-12 | Implementado |
| Pruebas automatizadas | Probado tecnicamente |
| Validacion academica/formal | Pendiente |
| Despliegue | Pendiente |

## Metodo y fuentes

`POST /patterns/analyze` requiere autenticacion y recibe exactamente `{ "preparedDatasetId": number }`. Analiza un solo artefacto y solo acepta `xm_gene_preparacion_base@1.0.0` (`energia_kwh`, recurrencia por `hora_xm`), `xm_demandasin_preparacion_base@1.0.0` (`demanda_kwh`, Monday-Sunday) y `xm_preciobolsnaci_preparacion_base@1.0.0` (`precio_cop_kwh`, recurrencia por `periodo`).

El metodo es `energy-pattern-descriptive@1.0.0`, estadistico determinista, no un modelo ML. No usa Marketplace, MatchingExecution, Weather, clustering, anomalias, fraude, alertas ni correlaciones.

## Reglas y resultado

La distribucion contiene count, min, max, mean, median y desviacion estandar muestral. La tendencia usa regresion lineal sobre el orden fecha/periodo. Es estable cuando $|slope| <= max(|value|, 1) * 10^{-12}$. Recurrencia solo expone grupos con dos o mas observaciones.

Con cero registros se persiste `no_results`; con componentes no calculables se retorna `partial` y advertencias. Un resultado incluye `analysisId`, estado, tipo, variable, periodo, muestra, metodo, patrones, advertencias y metadata de persistencia. El contenido de `PreparedDataset` se lee sin modificarse.

`PatternAnalysis` mantiene FK restrictiva al preparado, snapshot JSON del resultado, advertencias y metodo/version. Si guardar falla, el resultado se conserva con `persistence.failed`, sin detalles internos.

## Pruebas ejecutadas

`bun test src/tests/pattern-analysis.test.ts src/tests/patterns.test.ts`: 19 aprobadas, 0 fallidas, 40 aserciones. Cubre Gene, DemaSIN, Precio, suficiencia, `no_results`, perfil incompatible, reproducibilidad, inmutabilidad, precision observable, descripciones, snapshot y persistencia.

## Integracion PostgreSQL y HTTP

Se verifico una ejecucion temporal autenticada contra PostgreSQL real usando `PreparedDataset` 18: perfil `xm_demandasin_preparacion_base@1.0.0` y ruleset `xm_demandasin_base@1.0.0`. Los conteos iniciales fueron `PatternAnalysis=0` y `PreparedDataset=39`.

`POST /patterns/analyze` respondio HTTP 200 con `analysisId=9a8ca1b0-d119-420e-8829-a2a1346d140e`, estado `partial`, metodo `energy-pattern-descriptive@1.0.0` y `persistence=persisted`. PostgreSQL confirmo la fila con `preparedDatasetId=18`, `sampleSize=7`, periodo `2024-04-01..2024-04-07`, `createdAt` y `resultSnapshot`. La comparacion fue estructural, no textual, para contemplar el reordenamiento de claves JSONB; el snapshot fue equivalente a la respuesta tecnica HTTP sin metadata de persistencia.

El contenido de `PreparedDataset` fue identico antes y despues. La limpieza elimino exclusivamente el `PatternAnalysis` temporal y la sesion temporal. Los conteos finales regresaron a `PatternAnalysis=0` y `PreparedDataset=39`.

Ver [ADR-18](../../adr/ADR-18-analisis-deterministico-patrones.md).