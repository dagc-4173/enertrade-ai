# HU-04 — Experimento directo multi-horizonte D+1..D+7

Este experimento offline usa siete Ridge directos independientes. Para cada origen calendario t, las features se limitan a t o antes; el target es energia_kwh(t+h, periodo). No se usa recursión ni predicciones como features. Los artefactos son experimentales y no los carga el runtime.

## Corpus

Ver [manifest](corpus/manifest.json). El script extrae el consolidado Gene, congela CSV, vuelve a leerlo y solo entonces entrena/evalúa.

## Definición

Para cada periodo p: `X(t,p)=[energia(t,p), energia(t-6,p), energia(t,24), sin, cos]`; `y(t,h,p)=energia(t+h,p)`. Todas las fechas de features son <= t.

## Particiones

Targets TRAIN 2024-10-01..2026-03-31; VALIDATION 2026-04-01..2026-05-31; EXTERNAL HOLDOUT 2026-06-01..2026-09-20. El holdout no participa en selección.

| h | TRAIN muestras | VALIDATION muestras | HOLDOUT muestras |
|---:|---:|---:|---:|
| 1 | 13128 | 1464 | 2688 |
| 2 | 13128 | 1464 | 2688 |
| 3 | 13128 | 1464 | 2688 |
| 4 | 13128 | 1464 | 2688 |
| 5 | 13128 | 1464 | 2688 |
| 6 | 13128 | 1464 | 2688 |
| 7 | 13128 | 1464 | 2688 |

## Regla de promoción

Por horizonte: cero indisponibles, números finitos, MAE holdout <= 1.05x baseline seleccionado por VALIDATION, mejora estricta MAE o RMSE, WAPE <= 1.25x baseline y error absoluto máximo <= 10x desviación estándar de targets TRAIN.
