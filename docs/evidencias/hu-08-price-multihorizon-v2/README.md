# HU-08 — Precio directo multi-horizonte V2

## Hipótesis fijada antes del holdout

Mayor memoria histórica, estadísticos robustos, calendario mensual y referencias semanales relativas al target pueden capturar persistencia/estacionalidad no representada por V1, especialmente h1-h3/h7. La decisión se justifica por estructura temporal conocida y diagnóstico TRAIN/VALIDATION; el holdout V1 se conserva solo como diagnóstico post hoc. No se usan Oferta, Demanda, clima ni variables futuras.

## Corpus y protocolo congelados

Reutiliza exactamente `docs/evidencias/hu-08-price-multihorizon-v1/corpus/xm-preciobolsnaci-2024-01-01_2026-09-28.csv`, SHA-256 `2aca8e5868eaff50909c8154a842bfbe8a8db873976a90145e73e02aa7c9b02e`, 2024-01-01..2026-09-28, 1002 días y 24048 filas. Particiones, Ridge, grid 0.01/0.1/1/10/100, baselines y promoción son idénticos a V1. Alpha/baseline se seleccionan solo con VALIDATION.

## Diagnóstico V1 previo

En VALIDATION, periodo 20 concentra el mayor MAE y bias negativo en todos los horizontes; martes concentra frecuentemente el bias negativo y mayo queda subestimado. El promedio predicho está entre 13 y 24 COP/kWh por debajo del real según horizonte. Post hoc en holdout, el sesgo negativo crece con h y se concentra especialmente en periodos 19–20, viernes/sábado y agosto. Estas observaciones documentan V1, pero no seleccionan features V2.

## Features V2

- `price_same_period_at_origin`
- `price_same_period_1_day_before_origin`
- `price_same_period_2_days_before_origin`
- `price_same_period_3_days_before_origin`
- `price_same_period_6_days_before_origin`
- `price_same_period_7_days_before_origin`
- `price_same_period_13_days_before_origin`
- `price_same_period_14_days_before_origin`
- `price_same_period_20_days_before_origin`
- `price_same_period_21_days_before_origin`
- `price_same_period_27_days_before_origin`
- `price_same_period_28_days_before_origin`
- `price_same_period_mean_7d_ending_at_origin`
- `price_same_period_mean_14d_ending_at_origin`
- `price_same_period_mean_28d_ending_at_origin`
- `price_same_period_median_7d_ending_at_origin`
- `price_same_period_median_14d_ending_at_origin`
- `price_same_period_std_7d_ending_at_origin`
- `price_same_period_std_14d_ending_at_origin`
- `price_same_period_std_28d_ending_at_origin`
- `price_same_period_min_7d_ending_at_origin`
- `price_same_period_max_7d_ending_at_origin`
- `sin_2pi_period_minus1_over24`
- `cos_2pi_period_minus1_over24`
- `sin_2pi_target_weekday_over7`
- `cos_2pi_target_weekday_over7`
- `sin_2pi_target_month_minus1_over12`
- `cos_2pi_target_month_minus1_over12`

### Eliminadas por redundancia exacta

- `priceSamePeriodMean3d`: Exact linear combination of price(t,p), price(t-1,p) and price(t-2,p).
- `priceTrend1d`: Exact linear combination price(t,p)-price(t-1,p).
- `priceTrend7d`: Exact linear combination price(t,p)-price(t-7,p).
- `rollingMeanDifference7d14d`: Exact linear combination mean_7d-mean_14d.

### Referencias target-relative no duplicadas

| h | feature y fecha real |
|---:|---|
| 1 | Ninguna adicional; referencias target-relative duplican niveles origin-relative. |
| 2 | price_target_minus_7_same_period=target-7=origin-5<br>price_target_minus_14_same_period=target-14=origin-12<br>price_target_minus_21_same_period=target-21=origin-19<br>price_target_minus_28_same_period=target-28=origin-26 |
| 3 | price_target_minus_7_same_period=target-7=origin-4<br>price_target_minus_14_same_period=target-14=origin-11<br>price_target_minus_21_same_period=target-21=origin-18<br>price_target_minus_28_same_period=target-28=origin-25 |
| 4 | price_target_minus_14_same_period=target-14=origin-10<br>price_target_minus_21_same_period=target-21=origin-17<br>price_target_minus_28_same_period=target-28=origin-24 |
| 5 | price_target_minus_14_same_period=target-14=origin-9<br>price_target_minus_21_same_period=target-21=origin-16<br>price_target_minus_28_same_period=target-28=origin-23 |
| 6 | price_target_minus_14_same_period=target-14=origin-8<br>price_target_minus_21_same_period=target-21=origin-15<br>price_target_minus_28_same_period=target-28=origin-22 |
| 7 | Ninguna adicional; referencias target-relative duplican niveles origin-relative. |

Todas cumplen target-lag <= origin. h1 y h7 no agregan referencias porque serían duplicados exactos de niveles origin-relative ya presentes.

## Muestras y selección

| h | TRAIN | VALIDATION | EXTERNAL HOLDOUT | alpha | baseline |
|---:|---:|---:|---:|---:|---|
| 1 | 18960 | 1464 | 2880 | 0.01 | B1_ORIGIN |
| 2 | 18960 | 1464 | 2880 | 0.01 | B1_ORIGIN |
| 3 | 18960 | 1464 | 2880 | 100 | B1_ORIGIN |
| 4 | 18936 | 1464 | 2880 | 100 | B1_ORIGIN |
| 5 | 18912 | 1464 | 2880 | 100 | B1_ORIGIN |
| 6 | 18888 | 1464 | 2880 | 100 | B1_ORIGIN |
| 7 | 18864 | 1464 | 2880 | 100 | B1_ORIGIN |

## Alcance

Los artefactos son experimentales y no están conectados a runtime. `technicalCandidate` no equivale a validación académica, recomendación financiera ni liquidación.
