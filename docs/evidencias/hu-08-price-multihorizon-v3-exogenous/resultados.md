# Resultados HU-08 V3 exógeno

## Ablation A/B/C/D

| h | ablation | alpha | MAE | RMSE | Bias | WAPE | passesPromotionCriteria |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | A_PRICE_ONLY | 0.01 | 91.344422 | 129.584891 | -7.541152 | 12.121928 | false |
| 1 | B_PRICE_DEMAND | 0.01 | 90.124409 | 128.581107 | -0.579898 | 11.960025 | false |
| 1 | C_PRICE_GENERATION | 0.01 | 91.206938 | 129.628956 | 16.853099 | 12.103683 | false |
| 1 | D_PRICE_DEMAND_GENERATION | 10 | 90.948680 | 128.664395 | 2.328024 | 12.069411 | false |
| 2 | A_PRICE_ONLY | 0.01 | 113.792159 | 151.339652 | -18.527687 | 15.139148 | false |
| 2 | B_PRICE_DEMAND | 100 | 111.042122 | 149.035485 | -9.752159 | 14.773278 | false |
| 2 | C_PRICE_GENERATION | 0.01 | 110.816446 | 150.655944 | 18.767729 | 14.743253 | false |
| 2 | D_PRICE_DEMAND_GENERATION | 0.01 | 113.336305 | 150.912092 | -7.428090 | 15.078501 | false |
| 3 | A_PRICE_ONLY | 100 | 127.733646 | 165.221497 | -29.727231 | 17.023350 | false |
| 3 | B_PRICE_DEMAND | 100 | 125.382363 | 162.774882 | -27.122304 | 16.709989 | false |
| 3 | C_PRICE_GENERATION | 100 | 122.685750 | 162.412489 | 12.544871 | 16.350605 | true |
| 3 | D_PRICE_DEMAND_GENERATION | 100 | 127.622300 | 165.285590 | -23.424907 | 17.008510 | false |
| 4 | A_PRICE_ONLY | 100 | 139.956160 | 177.516211 | -36.432860 | 18.707998 | true |
| 4 | B_PRICE_DEMAND | 100 | 138.367138 | 175.724296 | -38.544088 | 18.495593 | true |
| 4 | C_PRICE_GENERATION | 100 | 134.118046 | 174.292437 | 11.364481 | 17.927615 | true |
| 4 | D_PRICE_DEMAND_GENERATION | 100 | 141.130506 | 179.265949 | -33.807127 | 18.864973 | true |
| 5 | A_PRICE_ONLY | 100 | 147.213925 | 185.456317 | -41.770318 | 19.741464 | true |
| 5 | B_PRICE_DEMAND | 100 | 146.746079 | 183.894975 | -48.003713 | 19.678725 | true |
| 5 | C_PRICE_GENERATION | 100 | 141.981874 | 182.190184 | 11.636399 | 19.039843 | true |
| 5 | D_PRICE_DEMAND_GENERATION | 100 | 150.635148 | 189.419012 | -42.656752 | 20.200251 | true |
| 6 | A_PRICE_ONLY | 100 | 152.861963 | 191.586850 | -49.900500 | 20.531212 | true |
| 6 | B_PRICE_DEMAND | 100 | 154.248916 | 191.647138 | -66.276644 | 20.717497 | true |
| 6 | C_PRICE_GENERATION | 100 | 144.957007 | 185.521252 | 3.013351 | 19.469481 | true |
| 6 | D_PRICE_DEMAND_GENERATION | 100 | 158.981310 | 198.171489 | -60.831596 | 21.353115 | false |
| 7 | A_PRICE_ONLY | 100 | 160.437464 | 199.309532 | -58.942632 | 21.573292 | false |
| 7 | B_PRICE_DEMAND | 100 | 167.132594 | 204.533918 | -88.677176 | 22.473556 | false |
| 7 | C_PRICE_GENERATION | 100 | 150.873303 | 191.939451 | -9.407509 | 20.287243 | true |
| 7 | D_PRICE_DEMAND_GENERATION | 100 | 174.517006 | 213.751511 | -83.738493 | 23.466504 | false |

La ablación primaria V3 fue fijada como D antes del holdout. Los pases de A/B/C son diagnósticos de contribución y no candidatos seleccionables post hoc.

## Comparación baseline/V1/V2/V3 combinado

| h | baseline MAE | V1 MAE | V2 MAE | V3 MAE | V1 bias | V3 bias | candidate V3 | replace V1 |
|---:|---:|---:|---:|---:|---:|---:|---|---|
| 1 | 79.288817 | 91.697931 | 95.902683 | 90.948680 | -7.893225 | 2.328024 | false | false |
| 2 | 106.068475 | 113.244783 | 118.973616 | 113.336305 | -19.686313 | -7.428090 | false | false |
| 3 | 125.315312 | 126.502479 | 131.668218 | 127.622300 | -31.986490 | -23.424907 | false | false |
| 4 | 142.571418 | 138.842471 | 143.175814 | 141.130506 | -40.285080 | -33.807127 | true | false |
| 5 | 154.088728 | 146.101167 | 150.336712 | 150.635148 | -46.429251 | -42.656752 | true | false |
| 6 | 157.232232 | 152.432141 | 155.353892 | 158.981310 | -54.896488 | -60.831596 | false | false |
| 7 | 161.441937 | 161.259176 | 160.753370 | 174.517006 | -64.270741 | -83.738493 | false | false |

Métricas completas, pérdidas por partición, parámetros y criterios: [results.json](results.json). `technicalCandidate` no equivale a validación académica. Si V3 pasa baseline pero es peor que un V1 candidato, `replaceV1=false`.
