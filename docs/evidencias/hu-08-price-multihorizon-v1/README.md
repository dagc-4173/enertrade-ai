# HU-08 — Experimento directo multi-horizonte de precio V1

## Alcance

Siete Ridge directos independientes predicen 24 precios COP/kWh para targetDate=t+h, h=1..7. No hay recursión, predicciones previas, Oferta, Demanda ni variables futuras. B1 permanece baseline y runtime no cambia.

## Corpus

Snapshot congelado después de leer PostgreSQL: `docs/evidencias/hu-08-price-multihorizon-v1/corpus/xm-preciobolsnaci-2024-01-01_2026-09-28.csv`, SHA-256 `2aca8e5868eaff50909c8154a842bfbe8a8db873976a90145e73e02aa7c9b02e`, 2024-01-01..2026-09-28, 1002 días, 24048 filas, 24 periodos/día, sin huecos, duplicados, faltantes, no finitos ni días incompletos. Fuente: XmConsolidatedDataset 12, EnergyDataset 208.

## Features

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

Se omitió `mean_3d` porque es combinación lineal exacta de t, t-1 y t-2 ya presentes. Rolling y estadísticos terminan en t.

## Particiones fijadas antes de evaluar

- TRAIN 2024-02-01..2026-03-31
- VALIDATION 2026-04-01..2026-05-31
- EXTERNAL HOLDOUT 2026-06-01..2026-09-28

El holdout es completamente posterior al holdout HU-08 documentado 2024-07-31..2024-09-28. No existe evidencia local de que el bloque 2026 se hubiera usado previamente para selección/evaluación de precio; esa trazabilidad no acredita por sí sola validación académica universal.

| h | TRAIN | VALIDATION | EXTERNAL HOLDOUT |
|---:|---:|---:|---:|
| 1 | 18960 | 1464 | 2880 |
| 2 | 18960 | 1464 | 2880 |
| 3 | 18960 | 1464 | 2880 |
| 4 | 18960 | 1464 | 2880 |
| 5 | 18960 | 1464 | 2880 |
| 6 | 18960 | 1464 | 2880 |
| 7 | 18960 | 1464 | 2880 |

## Selección y promoción

Grid alpha fijo: 0.01, 0.1, 1, 10, 100. Alpha y baseline se eligen solo con VALIDATION. Baselines: B1_ORIGIN=price(t,p), B7=price(target-7,p), HISTORICAL_MEAN por periodo ajustada solo en TRAIN. Promoción predefinida: unavailable=0, finitud, mejora MAE >=1%, WAPE no peor que baseline y maxAbsoluteError <=10 desviaciones estándar de targets TRAIN. No se relaja tras holdout.
