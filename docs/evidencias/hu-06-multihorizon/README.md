# HU-06 — Experimento directo multi-horizonte D+1..D+7

Experimento offline de demanda agregada diaria del SIN. No modifica runtime, frontend, Oferta ni Precio. Cada horizonte aprende directamente `X(t) -> demanda(t+h)`; no consume predicciones ni usa recursión.

## Corpus congelado

Consolidado DemaSIN 9, EnergyDataset 202, 2024-01-01..2026-09-29, 1003 días continuos. SHA-256: `18fd5aad3fe12eaa5290dba9ea551ccaef1a2baf4f41febf0c0354f0252c1735`. El CSV se escribe, relee y verifica antes de entrenar; no se entrena desde PostgreSQL vivo.

## Features V1

- `demanda(t)`
- `demanda(t-6)`
- `demanda(t-13)`
- `demanda(t-27)`
- seno/coseno del weekday calendario de `targetDate`

Para h=1 son exactamente D-1, D-7, D-14 y D-28 respecto al target del modelo anterior. Para h>1 permanecen expresadas respecto al origen observado t. Toda feature de demanda tiene fecha <=t.

## Particiones fijadas antes de evaluar

- TRAIN targets: 2024-02-04..2026-03-31
- VALIDATION: 2026-04-01..2026-05-31
- EXTERNAL HOLDOUT: 2026-06-01..2026-09-29

El holdout anterior de HU-06 terminó el 2024-09-28. El bloque 2026 es posterior y no fue usado por los experimentos D+1 documentados; constituye un holdout temporal virgen para Demanda según la evidencia disponible. El holdout no participa en baseline, alpha ni scaler.

| h | TRAIN | VALIDATION | HOLDOUT |
|---:|---:|---:|---:|
| 1 | 787 | 61 | 121 |
| 2 | 787 | 61 | 121 |
| 3 | 787 | 61 | 121 |
| 4 | 787 | 61 | 121 |
| 5 | 787 | 61 | 121 |
| 6 | 787 | 61 | 121 |
| 7 | 787 | 61 | 121 |

## Promoción predefinida

Cero indisponibles atribuibles al modelo, parámetros/métricas finitos, mejora MAE holdout >=1% frente al baseline seleccionado solo en VALIDATION, WAPE holdout no mayor al baseline y error absoluto máximo <=10 veces la desviación estándar de targets TRAIN. No se relaja después de observar el holdout.

## Alcance

Los candidatos son técnicos y experimentales. No representan demanda individual ni zonal, no definen confidence y no acreditan validación académica ni estabilidad futura.
