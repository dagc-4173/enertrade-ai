# Trazabilidad Final TG-II

## Alcance y fuentes

Esta matriz consolida el estado técnico verificable en el commit `c9a4887`. Las fuentes son código, Prisma/migraciones, pruebas, ADR, evidencia y el script [HU20](../../backend/scripts/hu20-integration.ts). No acredita validación académica ni despliegue.

Objetivos vigentes, sin reformulación:

- **OE1:** Identificar los requerimientos funcionales y no funcionales del motor de inteligencia artificial transaccional, así como variables, fuentes de datos históricos, criterios de integración y reglas de negocio necesarias.
- **OE2:** Diseñar la arquitectura lógica y funcional del motor, incluyendo análisis histórico, pronóstico de oferta/demanda, emparejamiento, precios y patrones.
- **OE3:** Codificar el motor mediante pipeline de datos, modelos/capacidades analíticas, servicios de integración y componentes necesarios para operar en el entorno simulado.
- **OE4:** Evaluar el desempeño del motor mediante pruebas funcionales, métricas de precisión, validación del matching, revisión de patrones y verificación de integración.

## Matriz principal

| Objetivo | Requisito/capacidad | HU | Sprint | Implementación verificable | Prueba | Evidencia | Estado técnico | Limitación |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- |
| OE1/OE3 | Registro de datos y metadatos | HU01 | S1 | `POST /datasets`, `EnergyDataset` | `dataset.test.ts` | [HU01](../evidencias/hu-01/README.md) | Implementada + probada + integración verificada | Sin calidad semántica en registro |
| OE1/OE3 | Calidad, reglas y estados | HU02 | S1 | Validación/rulesets y `validationReport` | `dataset.test.ts` | [HU02](../evidencias/hu-02/README.md) | Implementada + probada + integración verificada | Rulesets acotados a perfiles implementados |
| OE1/OE3 | Preparación, variables mínimas y procedencia | HU03 | S2 | `PreparedDataset`, perfiles y transformaciones | `dataset.test.ts` | [HU03](../evidencias/hu-03/README.md) | Implementada + probada + integración verificada | No universaliza perfiles ni genera features específicas |
| OE2/OE3 | Pronóstico supply, modelo ML | HU04 | S2 | `xm-gene-ridge@1.0.0`, `/forecasts/supply` | `forecast.test.ts` | [HU04](../evidencias/hu-04-forecast/README.md) | Implementada + probada + integración verificada | Proxy XM; no PV ni oferta comercial |
| OE4 | Métricas supply | HU05 | S4 | `/forecasts/supply/metrics`, artifact versionado | `forecast-metrics.test.ts` | [HU05](../evidencias/hu-05-metricas-api/README.md) | Implementada + probada | Sin `trainedAt` ni evaluación anual |
| OE2/OE3 | Pronóstico demand, modelo ML | HU06 | S2 | `xm-demandasin-ridge@1.0.0`, `/forecasts/demand` | `demand-forecast.test.ts` | [HU06](../evidencias/hu-06-demandasin/README.md), [HU20](../evidencias/hu-20/README.md) | Implementada + probada + integración verificada | Demanda agregada SIN; sin personalización/zona/confidence |
| OE4 | Métricas demand | HU07 | S4 | `/forecasts/demand/metrics` | `demand-forecast-metrics.test.ts` | [HU07](../evidencias/hu-07-metricas-demanda/README.md) | Implementada + probada | Artifact local; sin confidence |
| OE2/OE3 | Precio de referencia, regla determinista | HU08 | S3 | `xm-preciobolsnaci-b1@1.0.0`, `/forecasts/price` | `price-forecast.test.ts` | [HU08](../evidencias/hu-08-precio/inferencia-b1/README.md) | Implementada + probada + integración verificada | No es ML, precio personalizado ni liquidación |
| OE4 | Trazabilidad funcional de precio | HU09 | S3 | `PriceForecastExecution` | `price-forecast-trace.test.ts` | [HU09](../evidencias/hu-09-trazabilidad-precio/README.md) | Implementada + probada + integración verificada | Pendings no reconciliados |
| OE2/OE3/OE4 | Matching determinista simulado | HU10 | S3 | `matching-v1`, `/matches/suggest` | `matching.test.ts` | [HU10](../evidencias/hu-10/README.md), [HU20](../evidencias/hu-20/README.md) | Implementada + probada + integración verificada | Global, sin transacción comercial |
| OE4 | Trazabilidad de matching | HU11 | S3 | `MatchingExecution`, snapshots | `matching-trace.test.ts` | [HU11](../evidencias/hu-11/README.md) | Implementada + probada + integración verificada | Sin historial público ni reconciliación pending |
| OE2/OE3 | Patrones estadísticos deterministas | HU12 | S3 | `energy-pattern-descriptive@1.0.0` | `pattern-analysis.test.ts` | [HU12](../evidencias/hu-12/README.md) | Implementada + probada + integración verificada | No es ML; tres perfiles compatibles |
| OE4 | Consulta de patrones | HU13 | S3 | `GET /patterns`, filtros de rango/tipo/variable | `patterns.test.ts` | [HU13](../evidencias/hu-13/README.md) | Implementada + probada + integración verificada | Sin RBAC ni filtros por zona/usuario |
| OE2/OE3 | Contratos API de capacidades IA | HU14 | S1 | Forecasts, matching y patterns en Express | Suites por capacidad | [HU14](../evidencias/hu-14/README.md) | Implementada + probada + integración verificada | Sin OpenAPI/Swagger |
| OE4 | Errores, health y request ID | HU15 | S3 | Logger seguro, `/health`, envelopes | `observability.test.ts` | [HU15](../evidencias/hu-15/README.md) | Implementada + probada + integración verificada | Sin observabilidad externa/retención |
| - | Mensajería asíncrona | HU16 | S3 | No aplica; Express/Prisma síncronos | N/A | [HU16](../evidencias/hu-16/README.md) | No aplica | Reabrir solo ante necesidad de encolamiento |
| OE3/OE4 | Trazabilidad transversal IA | HU17 | S4 | `AiQueryTrace`, middleware y request ID | `ai-query-trace.test.ts` | [HU17](../evidencias/hu-17/README.md) | Implementada + probada + integración verificada | Best-effort, sin consulta/RBAC |
| OE3/OE4 | Versiones activas | HU18 | S4 | `/capabilities/versions`, cinco capacidades | `capability-versions.test.ts` | [HU18](../evidencias/hu-18/README.md) | Implementada + probada + integración verificada | Sin históricos ni fechas semánticas |
| OE3/OE4 | Indicadores consolidados | HU19 | S4 | `/indicators`, fuentes canónicas | `indicators.test.ts` | [HU19](../evidencias/hu-19/README.md) | Implementada con criterio parcial pendiente | RBAC pendiente |
| OE4 | Integración backend-motor | HU20 | S4 | Runner HTTP/Prisma/PostgreSQL real | `hu20-integration.ts`, `bun test` | [HU20](../evidencias/hu-20/README.md) | Implementada + probada + integración verificada | Sin SLA; matching global solo como subcaso histórico |

## Decisiones de diseño asociadas

- OE1: ADR-05 a ADR-08 delimitan validación, persistencia y preparación; ADR-07/08 incorporan XM Gene sin inventar timestamps.
- OE2: ADR-09, ADR-11, ADR-12, ADR-16 y ADR-18 definen respectivamente supply ML, demand ML, precio B1, matching y patrones.
- OE3: ADR-13, ADR-17, ADR-20 y ADR-21 cubren trazas funcionales, trazabilidad transversal y versiones activas.
- OE4: ADR-19 y ADR-22 cubren observabilidad mínima e indicadores; HU20 aporta la verificación integrada.

## Limitaciones globales

### Criterio funcional pendiente

- RBAC no existe en `User`, `requireAuth` ni endpoints; afecta explícitamente HU13 y HU19.

### Deuda técnica observada

- `AiQueryTrace` es best-effort y puede subregistrar si falla su persistencia.
- Ejecuciones funcionales `pending` no tienen reconciliación.
- Matching consulta publicaciones `ACTIVE` globales.
- No hay histórico de versiones ni `trainedAt` semántico registrado.
- No hay observabilidad externa, retención/alertas o CI detectada.

### Trabajo futuro condicionado

- Despliegue completo del sistema; Neon se usa solo como PostgreSQL.
- Validación académica formal por asesor/jurado/acta.

## Evidencia histórica supersedida

Algunas evidencias experimentales anteriores describen HU06 o HU08 como pendientes porque preceden la implementación posterior. No se eliminan: su estado histórico queda supersedido para el estado técnico actual por `/forecasts/demand`, `/forecasts/price`, sus pruebas, ADR-11/ADR-12 y la ejecución C15c de [HU20](../evidencias/hu-20/README.md). Esta nota no reescribe sus resultados experimentales.

## Commits técnicos relevantes

- `c9a4887`: integración HU20 consolidada.
- `0226b68`: indicadores HU19.
- `e2ccc89`: catálogo HU18.
- `11dd688`: trazabilidad HU17.
- `fa21fe7`: observabilidad HU15.
- `213c5ec`: análisis y consulta de patrones HU12/HU13.
- `7abbc8e`: trazabilidad HU11.
- `68b5006`: matching HU10.
- `1cc3246`, `d642722`: HU09/HU08.
- `aad7fd6`: métricas HU07.
- Commits anteriores de HU01-HU07 están trazados en sus README y ADR respectivos.
