# Backlog TG-II - Estado Técnico Real

Fuente de reconciliación: commit `c9a4887`, código, pruebas y evidencia técnica. “Estado documental anterior” describe el backlog/evidencia disponible antes de esta reconciliación; no sustituye el documento académico original.

| HU | Nombre | Sprint | Story points | Estado documental anterior | Estado técnico actual | Prueba | Evidencia | Limitación |
| --- | --- | ---: | ---: | --- | --- | --- | --- | --- |
| HU01 | Registrar dataset energético base | S1 | 5 | Pendiente | Implementada + probada + integración verificada | `dataset.test.ts` | [HU01](../evidencias/hu-01/README.md) | Registro no valida calidad semántica |
| HU02 | Validar calidad de datos | S1 | 5 | Pendiente | Implementada + probada + integración verificada | `dataset.test.ts` | [HU02](../evidencias/hu-02/README.md) | Reglas por perfiles implementados |
| HU03 | Preparar dataset | S2 | 5 | Pendiente | Implementada + probada + integración verificada | `dataset.test.ts` | [HU03](../evidencias/hu-03/README.md) | Features específicas pendientes |
| HU04 | Pronóstico de oferta/generación | S2 | 8 | Pendiente | Implementada + probada + integración verificada | `forecast.test.ts` | [HU04](../evidencias/hu-04-forecast/README.md) | Proxy XM, no oferta comercial/PV |
| HU05 | Métricas de generación | S4 | 3 | Pendiente | Implementada + probada | `forecast-metrics.test.ts` | [HU05](../evidencias/hu-05-metricas-api/README.md) | Sin `trainedAt` |
| HU06 | Pronóstico de demanda | S2 | 8 | Evidencia experimental pendiente | Implementada + probada + integración verificada | `demand-forecast.test.ts` | [HU06](../evidencias/hu-06-demandasin/README.md), [HU20](../evidencias/hu-20/README.md) | SIN agregado, no zonal |
| HU07 | Métricas de demanda | S4 | 3 | Pendiente | Implementada + probada | `demand-forecast-metrics.test.ts` | [HU07](../evidencias/hu-07-metricas-demanda/README.md) | Sin confidence |
| HU08 | Precio de referencia | S3 | 8 | Evidencia experimental pendiente | Implementada + probada + integración verificada | `price-forecast.test.ts` | [HU08](../evidencias/hu-08-precio/inferencia-b1/README.md) | Regla B1, no ML |
| HU09 | Trazabilidad precio | S3 | 3 | Pendiente | Implementada + probada + integración verificada | `price-forecast-trace.test.ts` | [HU09](../evidencias/hu-09-trazabilidad-precio/README.md) | Pending sin reconciliación |
| HU10 | Sugerir matching | S3 | 8 | Pendiente histórico | Implementada + probada + integración verificada | `matching.test.ts` | [HU10](../evidencias/hu-10/README.md), [HU20](../evidencias/hu-20/README.md) | Global, no transaccional |
| HU11 | Registrar resultado matching | S3 | 3 | Pendiente | Implementada + probada + integración verificada | `matching-trace.test.ts` | [HU11](../evidencias/hu-11/README.md) | Sin consulta de historial |
| HU12 | Identificar patrones | S3 | 8 | Pendiente | Implementada + probada + integración verificada | `pattern-analysis.test.ts` | [HU12](../evidencias/hu-12/README.md) | Método determinista |
| HU13 | Consultar patrones | S3 | 3 | Pendiente | Implementada + probada + integración verificada | `patterns.test.ts` | [HU13](../evidencias/hu-13/README.md) | RBAC/filtros zona-usuario pendientes |
| HU14 | API de resultados IA | S1 | 5 | Pendiente | Implementada + probada + integración verificada | Suites de forecasts/matching/patterns | [HU14](../evidencias/hu-14/README.md) | Sin OpenAPI |
| HU15 | Manejo de errores IA | S3 | 3 | Pendiente | Implementada + probada + integración verificada | `observability.test.ts` | [HU15](../evidencias/hu-15/README.md) | Sin monitoreo externo |
| HU16 | Mensajería asíncrona | S3 | — | No aplicable al prototipo | No aplica | N/A | [HU16](../evidencias/hu-16/README.md) | Síncrono; reabrir si se requiere cola |
| HU17 | Trazabilidad consultas IA | S4 | 5 | Pendiente | Implementada + probada + integración verificada | `ai-query-trace.test.ts` | [HU17](../evidencias/hu-17/README.md) | Best-effort, sin GET de auditoría |
| HU18 | Versiones activas | S4 | 3 | Pendiente | Implementada + probada + integración verificada | `capability-versions.test.ts` | [HU18](../evidencias/hu-18/README.md) | Sin versiones históricas |
| HU19 | Indicadores | S4 | 5 | Pendiente | Implementada con criterio parcial pendiente | `indicators.test.ts` | [HU19](../evidencias/hu-19/README.md) | RBAC pendiente |
| HU20 | Integración backend-motor | S4 | 5 | Pendiente | Implementada + probada + integración verificada | `hu20-integration.ts` | [HU20](../evidencias/hu-20/README.md) | Sin SLA formal |

## Nota sobre HU16

HU16 no es un resultado implementado. Es **No aplica** al prototipo actual porque la arquitectura es síncrona y no contiene broker, queue ni worker. Su aplicabilidad es condicional a una necesidad futura de procesamiento diferido.

## Coherencia y contradicciones pendientes

- El documento TG-II y parte de evidencia experimental conservan estados previos “Pendiente”; esta tabla no los edita, solo registra el estado técnico posterior verificable.
- Los story points se transcribieron desde la tabla 7.2 del informe TG-II; el backlog oficial de historias no contiene esa columna.
- HU13/HU19 implementan su funcionalidad técnica, pero no cumplen un eventual criterio de consulta restringida por rol porque RBAC no existe.
