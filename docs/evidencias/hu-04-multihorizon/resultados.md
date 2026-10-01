# Resultados

## Selección en VALIDATION

| h | alpha | MAE Ridge | RMSE Ridge | Bias Ridge | WAPE Ridge | baseline seleccionado | MAE baseline |
|---:|---:|---:|---:|---:|---:|---|---:|
| 1 | 100 | 335587.14 | 491204.42 | 74145.27 | 3.3043 | B_ORIGIN_6 | 362758.28 |
| 2 | 0.01 | 635140.60 | 752891.44 | -289447.23 | 6.2537 | B_ORIGIN_6 | 592187.28 |
| 3 | 100 | 758380.50 | 863537.15 | -472925.13 | 7.4672 | B_ORIGIN_6 | 738257.08 |
| 4 | 0.01 | 767476.11 | 876890.12 | -489866.30 | 7.5568 | B_HISTORICAL_MEAN | 750162.05 |
| 5 | 0.01 | 747213.01 | 857322.75 | -458637.05 | 7.3572 | B_ORIGIN_0 | 729659.54 |
| 6 | 100 | 676275.78 | 792918.06 | -372300.11 | 6.6588 | B_ORIGIN_0 | 585952.57 |
| 7 | 100 | 413997.98 | 592862.05 | -191217.02 | 4.0763 | B_ORIGIN_0 | 362758.28 |

## Evaluación EXTERNAL HOLDOUT

| h | modelId | alpha | MAE | RMSE | Bias | WAPE | baseline | candidate |
|---|---|---:|---:|---:|---:|---:|---|---|
| 1 | xm-gene-ridge-h1 | 100 | 340903.07 | 463790.31 | 144300.86 | 3.2948 | B_ORIGIN_6 | true |
| 2 | xm-gene-ridge-h2 | 0.01 | 649653.60 | 768954.45 | -392256.34 | 6.2789 | B_ORIGIN_6 | false |
| 3 | xm-gene-ridge-h3 | 100 | 878441.57 | 992502.69 | -657717.96 | 8.4901 | B_ORIGIN_6 | false |
| 4 | xm-gene-ridge-h4 | 0.01 | 893608.80 | 1010561.61 | -678579.00 | 8.6367 | B_HISTORICAL_MEAN | false |
| 5 | xm-gene-ridge-h5 | 0.01 | 859499.02 | 974231.70 | -631168.69 | 8.3070 | B_ORIGIN_0 | false |
| 6 | xm-gene-ridge-h6 | 100 | 734200.09 | 827806.36 | -517528.39 | 7.0960 | B_ORIGIN_0 | false |
| 7 | xm-gene-ridge-h7 | 100 | 400887.91 | 523514.02 | -241972.03 | 3.8746 | B_ORIGIN_0 | false |

Las métricas completas de validation, baselines, diagnóstico por periodo y holdout están en [results.json](results.json).
