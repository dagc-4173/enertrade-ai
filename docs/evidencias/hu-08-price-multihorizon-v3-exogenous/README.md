# HU-08 — Precio multi-horizonte V3 con exógenas observadas

## Hipótesis

¿La dinámica reciente de generación y demanda observadas hasta forecastOriginDate mejora Precio D+1..D+7 más allá de la historia propia de Precio? No se usan forecasts de Oferta/Demanda, valores futuros, clima ni variables comerciales futuras.

## Snapshot alineado

CSV `docs/evidencias/hu-08-price-multihorizon-v3-exogenous/corpus/xm-price-gene-demand-2024-01-01_2026-09-28.csv`, SHA-256 `6a809594044cf8f608cf2e52bfbec6d1bb0ebe7268414c4ad1f6da8d9aceae6e`, rango común 2024-01-01..2026-09-28, 1002 días y 24048 filas. Precio y Gene tienen 24 periodos exactos/día. Generación total diaria es la suma documentada de esos 24 periodos; también se retiene Gene del mismo periodo. DemaSIN conserva todas las filas y su estado semántico. Exclusiones globales: 2026-09-16, 2026-09-28, 2026-09-29; 29/09 queda fuera del rango común, 16/09 y 28/09 permanecen en CSV pero invalidan muestras que las atraviesan.

## Fuentes

- Precio: consolidado 12, EnergyDataset 208.
- Gene: consolidado 11, EnergyDataset 206.
- DemaSIN: consolidado 9, EnergyDataset 202.

## Features exógenas

Demanda: demand_at_origin, demand_1_day_before_origin, demand_7_days_before_origin, demand_mean_7d_ending_at_origin, demand_mean_14d_ending_at_origin, demand_change_1d.

Generación: generation_total_at_origin, generation_total_1_day_before_origin, generation_total_7_days_before_origin, generation_total_mean_7d_ending_at_origin, generation_total_mean_14d_ending_at_origin, generation_total_change_1d, generation_same_period_at_origin, generation_same_period_1_day_before_origin, generation_same_period_7_days_before_origin.

Interacción incluida: ratio demanda/generación total, válido como proxy agregado SIN porque ambas magnitudes están en kWh. Se omite demanda-generación por redundancia lineal exacta. Cambios diarios se conservan por protocolo solicitado aunque sean combinaciones de niveles Ridge. Todas las fechas y rolling windows terminan en t; cualquier DemaSIN en revisión invalida la muestra.

## Muestras y pérdidas en holdout

| h | TRAIN | VALIDATION | HOLDOUT | price history | Gene missing | Demand missing | semantic direct | semantic rolling |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 18960 | 1464 | 2592 | 0 | 0 | 0 | 72 | 216 |
| 2 | 18960 | 1464 | 2616 | 0 | 0 | 0 | 72 | 192 |
| 3 | 18960 | 1464 | 2640 | 0 | 0 | 0 | 72 | 168 |
| 4 | 18960 | 1464 | 2664 | 0 | 0 | 0 | 72 | 144 |
| 5 | 18960 | 1464 | 2688 | 0 | 0 | 0 | 72 | 120 |
| 6 | 18960 | 1464 | 2712 | 0 | 0 | 0 | 48 | 120 |
| 7 | 18960 | 1464 | 2736 | 0 | 0 | 0 | 48 | 96 |

## Ablaciones

A=Price V1; B=Price+Demand; C=Price+Generation; D=Price+Demand+Generation+ratio. Las cuatro usan exactamente las mismas muestras por horizonte. Alpha se selecciona solo con VALIDATION.

Los artefactos combinados V3 permanecen offline y no se conectan a runtime.
