# HU-08 Precio V4 Gene-only — Preregistración técnica

## Estado

`pendingProspectiveValidation`. No existen resultados prospectivos, candidatura técnica ni integración runtime. Cutoff: `2026-10-01T16:18:30.593Z`.

## Hipótesis congelada

La dinámica reciente de Gene observada hasta forecastOriginDate mejora PrecBolsNaci futuro frente a Precio V1. V4 excluye totalmente DemaSIN e interacciones Demanda/Generación. Cualquier feature nueva exige V5.

## Features congeladas

- `price_same_period_at_origin`
- `price_same_period_1_day_before_origin`
- `price_same_period_2_days_before_origin`
- `price_same_period_6_days_before_origin`
- `price_same_period_7_days_before_origin`
- `price_same_period_13_days_before_origin`
- `price_same_period_14_days_before_origin`
- `price_same_period_mean_7d_ending_at_origin`
- `price_same_period_mean_14d_ending_at_origin`
- `price_same_period_std_7d_ending_at_origin`
- `price_same_period_std_14d_ending_at_origin`
- `sin_2pi_period_minus1_over24`
- `cos_2pi_period_minus1_over24`
- `sin_2pi_target_weekday_over7`
- `cos_2pi_target_weekday_over7`
- `generation_total_at_origin`
- `generation_total_1_day_before_origin`
- `generation_total_7_days_before_origin`
- `generation_total_mean_7d_ending_at_origin`
- `generation_total_mean_14d_ending_at_origin`
- `generation_total_change_1d`
- `generation_same_period_at_origin`
- `generation_same_period_1_day_before_origin`
- `generation_same_period_7_days_before_origin`

Gene total diario es suma exacta de sus 24 periodos. Se conservan además Gene del mismo periodo p en t, t-1 y t-7. No hay forecasts futuros ni valores posteriores a t.

## Ajuste permitido

TRAIN 2024-02-01..2026-03-31; VALIDATION 2026-04-01..2026-05-31. Snapshot Price+Gene `price-gene-adjustment-2024-01-01_2026-05-31.csv`, SHA-256 `5982e8411a3386c40e0d4e0f9b9530190739275dc3e7da0f6c4ec429fd845e0b`. El bloque 2026-06-01..2026-09-28 está prohibido para decisiones V4 y solo permanece como evidencia V1/V2/V3.

| h | alpha congelado | baseline congelado | MAE validation V4 | MAE baseline validation | estado |
|---:|---:|---|---:|---:|---|
| 1 | 0.01 | B1_ORIGIN | 82.370245 | 70.772233 | pendingProspectiveValidation |
| 2 | 0.01 | B1_ORIGIN | 107.422273 | 103.144443 | pendingProspectiveValidation |
| 3 | 100 | B1_ORIGIN | 123.270737 | 122.875050 | pendingProspectiveValidation |
| 4 | 100 | B1_ORIGIN | 136.785586 | 137.373826 | pendingProspectiveValidation |
| 5 | 100 | B1_ORIGIN | 149.445617 | 147.399383 | pendingProspectiveValidation |
| 6 | 100 | B1_ORIGIN | 163.607079 | 155.526323 | pendingProspectiveValidation |
| 7 | 100 | B1_ORIGIN | 175.152741 | 167.964639 | pendingProspectiveValidation |

## Evidencia prospectiva

Preliminar: 14 target days completos por horizonte. Suficiente: mínimo 60 días completos/1.440 predicciones de periodo por horizonte, cubriendo al menos ocho ciclos semanales. Esto no garantiza potencia estadística universal; evita declarar suficiencia con uno o dos días. Solo targets XM recibidos después del cutoff pueden evaluarse.
