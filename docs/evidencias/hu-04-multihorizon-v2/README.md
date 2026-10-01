# HU-04 — Experimento directo multi-horizonte V2

## Hipótesis

Las features mínimas V1 no capturan suficiente dinámica reciente, periodicidad semanal y estabilidad temporal para h2..h7. V2 cambia solo features; conserva corpus, particiones, baselines, Ridge, grid alpha y promoción V1.

Los siete artefactos V2 se integran en Oferta mediante selección por `horizonDays`.
La capacidad permanece experimental: la respuesta expone `modelStatus=experimental`
y `academicValidation=pending`. No se modifican Demanda, Precio ni
`xm-gene-ridge@1.0.0`.

## Corpus y particiones

Reutiliza el snapshot V1 únicamente tras verificar SHA-256 `e7ffe35f5091e7733b06d2acea3d62ef1fe79a7f7730102fbaac3b0ccf44cb8b`, continuidad, 994 días y 23.856 observaciones. TRAIN/VALIDATION/HOLDOUT son idénticos a V1.

| h | TRAIN | VALIDATION | HOLDOUT |
|---:|---:|---:|---:|
| 1 | 13128 | 1464 | 2688 |
| 2 | 13128 | 1464 | 2688 |
| 3 | 13128 | 1464 | 2688 |
| 4 | 13128 | 1464 | 2688 |
| 5 | 13128 | 1464 | 2688 |
| 6 | 13128 | 1464 | 2688 |
| 7 | 13128 | 1464 | 2688 |

## Features finales

- `energy_same_period_at_origin`
- `energy_same_period_6_days_before_origin`
- `energy_period24_at_origin`
- `energy_same_period_1_day_before_origin`
- `energy_same_period_2_days_before_origin`
- `energy_same_period_7_days_before_origin`
- `energy_same_period_13_days_before_origin`
- `energy_same_period_14_days_before_origin`
- `energy_same_period_27_days_before_origin`
- `energy_same_period_28_days_before_origin`
- `energy_same_period_mean_7d_ending_at_origin`
- `energy_same_period_mean_14d_ending_at_origin`
- `energy_same_period_std_7d_ending_at_origin`
- `sin_2pi_hour_minus1_over24`
- `cos_2pi_hour_minus1_over24`
- `sin_2pi_target_weekday_over7`
- `cos_2pi_target_weekday_over7`

Se omitieron `mean_3d` y las tendencias t−(t−1), t−(t−7) por ser combinaciones lineales exactas de niveles ya incluidos. Los estadísticos móviles terminan en t. Seno/coseno de weekday usa calendario conocido de targetDate, no una observación futura.
