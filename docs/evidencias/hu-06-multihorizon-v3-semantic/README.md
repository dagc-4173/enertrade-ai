# HU-06 — Reevaluación retrospectiva multi-horizonte con elegibilidad semántica

## Naturaleza de la ejecución

Esta es una **reevaluación retrospectiva técnica**. El bloque 2026-06-01..2026-09-29 no es un holdout externo virgen: sus anomalías se observaron antes de diseñar la política semántica. Ningún `technicalCandidate` equivale a validación académica o externa independiente.

## Corpus y política

Se reutiliza sin cambios el CSV `docs/evidencias/hu-06-multihorizon/corpus/xm-demandasin-2024-01-01_2026-09-29.csv`, SHA-256 `18fd5aad3fe12eaa5290dba9ea551ccaef1a2baf4f41febf0c0354f0252c1735`, rango 2024-01-01..2026-09-29, 1003 observaciones. Permanecen físicamente 16/09, 28/09 y 29/09; se excluyen solo al construir muestras mediante `demand-semantic-eligibility.ts`. Regla: ratio contra mediana previa, ventana 14, mínimo 7, threshold 0.20.

## Particiones

- TRAIN: 2024-02-04..2026-03-31
- VALIDATION: 2026-04-01..2026-05-31
- RETROSPECTIVE EVALUATION: 2026-06-01..2026-09-29

Alpha, baseline y scaler se seleccionan/ajustan solo con TRAIN/VALIDATION elegibles. La evaluación retrospectiva no interviene en selección. Features, baselines, grid y promoción permanecen idénticos a V1/V2. El umbral catastrófico se recalcula con targets TRAIN elegibles. No se generan artefactos runtime.

## Muestras V1

| h | TRAIN | VALIDATION | RETROSPECTIVE EVALUATION |
|---:|---:|---:|---:|
| 1 | 787 | 61 | 116 |
| 2 | 787 | 61 | 116 |
| 3 | 787 | 61 | 116 |
| 4 | 787 | 61 | 116 |
| 5 | 787 | 61 | 116 |
| 6 | 787 | 61 | 117 |
| 7 | 787 | 61 | 117 |

## Muestras V2

| h | TRAIN | VALIDATION | RETROSPECTIVE EVALUATION |
|---:|---:|---:|---:|
| 1 | 787 | 61 | 107 |
| 2 | 787 | 61 | 108 |
| 3 | 787 | 61 | 109 |
| 4 | 787 | 61 | 110 |
| 5 | 787 | 61 | 111 |
| 6 | 787 | 61 | 112 |
| 7 | 786 | 61 | 113 |

## Prospective validation required

Desde esta ejecución quedan congelados para una evaluación futura: corpus de entrenamiento, features V1/V2, alpha seleccionado por horizonte, baseline seleccionado, regla semántica `demandasin_severe_drop_vs_trailing_median_v1` y criterios de aceptación. Los parámetros Ridge ajustados quedan en `results.json`, no como artefactos runtime. Datos recibidos después del cierre se evaluarán prospectivamente sin cambiar modelo, features, alpha, baseline, regla semántica ni promoción. No se fija todavía una fecha final porque no existe suficiente información futura independiente.

| h | alpha V2 congelado | baseline V2 congelado |
|---:|---:|---|
| 1 | 0.01 | B_ORIGIN_MINUS_6 |
| 2 | 10 | B_ORIGIN_MINUS_6 |
| 3 | 10 | B_ORIGIN_MINUS_6 |
| 4 | 10 | B_TRAIN_TARGET_WEEKDAY_MEAN |
| 5 | 10 | B_ORIGIN |
| 6 | 10 | B_ORIGIN |
| 7 | 100 | B_ORIGIN |
