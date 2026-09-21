# PE-09 - Metricas y trazabilidad de capacidades analiticas

## Estado

**APROBADO TECNICAMENTE.** Las pruebas automatizadas y la validacion visual
manual de la interfaz real fueron ejecutadas y aprobadas. La validacion
academica/formal permanece pendiente hasta la revision final del informe.

## Alcance verificado

| Capacidad | Artefacto activo | Datos presentados o trazados | Resultado |
| --- | --- | --- | --- |
| Supply | `xm-gene-ridge@1.0.0` | MAE, RMSE, sesgo medio, WAPE, holdout, rango de entrenamiento, unidad kWh y formato es-CO | Contrato y validacion visual aprobados |
| Demand | `xm-demandasin-ridge@1.0.0` | MAE, RMSE, sesgo medio, WAPE, holdout, rango de entrenamiento, unidad kWh y formato es-CO | Contrato y validacion visual aprobados |
| Price | `xm-preciobolsnaci-b1@1.0.0` | Regla determinista B1, unidad `COP/kWh`, factor, `executionId`, persistencia, grafico D-1 y formato es-CO | Contrato y validacion visual aprobados |

El catalogo `GET /capabilities/versions` identifica Supply y Demand como
`ml_model`, y Price como `deterministic_rule`. La version procede de los
loaders de artefactos activos; no se infiere desde el frontend ni desde archivos
historicos.

## Criterios PE-09

### Supply y Demand

Los endpoints `GET /forecasts/supply/metrics` y
`GET /forecasts/demand/metrics` proyectan el artefacto Ridge validado y activo.
Su contrato contiene `modelId`, `modelVersion`, `active: true`, las metricas
MAE, RMSE, bias y WAPE, mas el rango del holdout externo y el rango fuente de
entrenamiento. El cliente rechaza respuestas con identidades, unidades, hashes,
rangos o metricas incompatibles antes de presentarlas.

El panel de pronosticos presenta esas metricas bajo "Metricas del modelo
activo", con las etiquetas MAE, RMSE, Sesgo medio, WAPE, Holdout temporal y
Datos de entrenamiento. Tambien advierte si el resultado de pronostico y las
metricas no comparten `modelId` y `modelVersion`.

### Price

Price no configura ni solicita endpoint de metricas. El panel solo identifica
la regla determinista B1 y, despues de una estimacion, muestra regla, version,
unidad, `executionId`, estado de persistencia y el factor usado. La respuesta
de precio exige `unit: COP/kWh`, `rule.type: deterministic_baseline`, factores
usados/omitidos y una traza valida. Por tanto no se presentan MAE, RMSE, sesgo,
WAPE, holdout ni rango de entrenamiento como si B1 fuera un modelo ML.

La traza HU-09 persiste cada intento con UUID independiente. Para una ejecucion
exitosa, el contrato probado reporta `persistence: persisted`; cuando la
persistencia falla, conserva el resultado tecnico con
`persistence: failed` sin inventar un identificador.

## Validacion visual manual

La validacion visual manual posterior fue ejecutada y aprobada mediante
capturas de la interfaz real.

| Capacidad | Verificaciones visuales aprobadas |
| --- | --- |
| Supply | `xm-gene-ridge@1.0.0`; MAE, RMSE, sesgo medio, WAPE, holdout, rango de entrenamiento, unidad kWh y formato es-CO |
| Demand | `xm-demandasin-ridge@1.0.0`; MAE, RMSE, sesgo medio, WAPE, holdout, rango de entrenamiento, unidad kWh y formato es-CO |
| Price | `xm-preciobolsnaci-b1@1.0.0`; regla determinista B1; ausencia de metricas ML; `executionId`; persistencia; factor `previous_day_same_period_price`; unidad COP/kWh; grafico D-1 observado frente a estimado B1; formato es-CO |

Las capturas confirman que no se presentan metricas de ML para Price y que las
metricas visibles de Supply y Demand corresponden a las capacidades Ridge
activas indicadas en esta evidencia.

## Pruebas ejecutadas

| ID | Comando | Cobertura relevante | Resultado observado |
| --- | --- | --- | --- |
| PE09-BE-01 | `bun test src/tests/capability-versions.test.ts src/tests/forecast-metrics.test.ts src/tests/demand-forecast-metrics.test.ts src/tests/price-forecast.test.ts src/tests/price-forecast-trace.test.ts` desde `backend` | Catalogo activo, HU-05 Supply, HU-07 Demand, B1 y HU-09 | 128 aprobadas, 0 fallidas, 428 aserciones |
| PE09-FE-01 | `bun test tests/forecast.test.tsx` desde `frontend` | Validacion de contratos cliente de Supply, Demand y Price | 28 aprobadas, 0 fallidas, 43 aserciones |

Las pruebas de metricas backend verifican que la identidad publicada coincide
con el artefacto activo y rechazan metricas no finitas, WAPE incoherente,
rangos o hashes incompatibles. Las pruebas de precio verifican
`xm-preciobolsnaci-b1@1.0.0`, la unidad, los factores, la traza persistida y
fallos de persistencia sin ocultar una estimacion valida.

## Evidencia relacionada

- [HU-05 - Metricas Supply](../hu-05-metricas-api/README.md)
- [HU-07 - Metricas Demand](../hu-07-metricas-demanda/README.md)
- [HU-09 - Trazabilidad de Precio](../hu-09-trazabilidad-precio/README.md)
- [HU-18 - Catalogo de capacidades](../hu-18/README.md)

## Limites

Esta evidencia incluye contratos automatizados y validacion visual manual con
capturas de la interfaz real. No incluye una llamada a XM ni una nueva insercion
en PostgreSQL durante PE-09. Tampoco convierte las metricas de Ridge en garantia
futura ni atribuye metricas de evaluacion a la regla B1. La validacion
academica/formal sigue pendiente hasta la revision final del informe.