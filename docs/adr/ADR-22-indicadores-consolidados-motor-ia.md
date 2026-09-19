# ADR-22 - Indicadores consolidados del motor IA

## Decisión

`GET /indicators` consolida fuentes canónicas sin tabla KPI: pronósticos, errores y duración desde `AiQueryTrace`; precio desde `PriceForecastExecution`; sugerencias desde `MatchingExecution.resultSnapshot.matches`; patrones desde `PatternAnalysis.resultSnapshot.patterns`; capacidades desde HU18.

Los resultados `empty` no cuentan como producción, pero sus trazas sí participan en duración. Los `failed` cuentan como errores y duración. Se excluye `engine_indicators` de errores, muestra y promedio para prevenir autoconteo. `NO_TRACE_DATA` y `NO_FUNCTIONAL_RECORDS` son advertencias objetivas sin umbral arbitrario.

## Alternativas y consecuencias

Se descartan tabla KPI, vistas materializadas, dashboards e infraestructura externa. Las longitudes de arrays JSONB se agregan en PostgreSQL con SQL etiquetado, sin interpolar entradas. Las trazas best-effort pueden subregistrar; RBAC sigue pendiente porque no existe infraestructura de roles.