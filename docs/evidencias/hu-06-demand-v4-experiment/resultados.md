# HU-06 Demanda V4: resultados retrospectivos técnicos

Evaluación sobre bloque **RETROSPECTIVE EVALUATION**, ya observado al diseñar la regla semántica; no es external holdout virgen. A es la única variante primaria; B es V2 congelado y C es comparador separado. No escoger C o la ablación después de ver resultados. Calidad y cobertura no se sustituyen entre sí.

## Calidad predictiva y cobertura operativa, separadas por horizonte

La columna orígenes corresponde únicamente al caso de capacidad preregistrado 17..27/09; no es número de aciertos. Fechas fuente de cada estadística C y su span real: [results.json](results.json).

| Variante | h | TRAIN/VALIDATION/RETROSPECTIVE | Orígenes | Targets futuros | Alpha | Baseline | MAE | RMSE | Bias | WAPE % | Error máximo | Umbral catastrófico | Unavailable |
|---|---:|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| A | 1 | 787/61/116 | 10 | 0 | 0.01 | B_ORIGIN_MINUS_6 | 5610296.76 | 7698530.01 | 685836.94 | 2.2714 | 26675739.51 | 135205033.34 | 0 |
| A | 2 | 787/61/116 | 10 | 0 | 0.01 | B_ORIGIN_MINUS_6 | 14144529.02 | 16074651.74 | -12786826.71 | 5.7274 | 30064396.75 | 135205033.34 | 0 |
| A | 3 | 787/61/116 | 10 | 0 | 0.01 | B_ORIGIN_MINUS_6 | 12801346.49 | 14584216.70 | -11022408.24 | 5.1789 | 27244603.81 | 135205033.34 | 0 |
| A | 4 | 787/61/116 | 10 | 0 | 0.01 | B_TRAIN_TARGET_WEEKDAY_MEAN | 9136913.27 | 10597104.56 | -3776332.43 | 3.6916 | 24369293.41 | 135205033.34 | 0 |
| A | 5 | 787/61/116 | 10 | 1 | 0.01 | B_ORIGIN | 10892959.28 | 12790770.29 | -8255069.70 | 4.4023 | 27060325.79 | 135205033.34 | 0 |
| A | 6 | 787/61/117 | 10 | 2 | 0.01 | B_ORIGIN | 15591274.16 | 17621113.46 | -14732224.52 | 6.3090 | 30377359.45 | 135205033.34 | 0 |
| B | 1 | 787/61/107 | 0 | 0 | 0.01 | B_ORIGIN_MINUS_6 | 5413085.54 | 7510499.08 | -1600183.08 | 2.1911 | 27535860.29 | 135205033.34 | 0 |
| B | 2 | 787/61/108 | 0 | 0 | 10 | B_ORIGIN_MINUS_6 | 8079545.18 | 9945467.55 | -3194421.40 | 3.2688 | 26268786.95 | 135205033.34 | 0 |
| B | 3 | 787/61/109 | 0 | 0 | 10 | B_ORIGIN_MINUS_6 | 8451738.63 | 9935752.03 | -3312695.80 | 3.4169 | 20752659.33 | 135205033.34 | 0 |
| B | 4 | 787/61/110 | 0 | 0 | 10 | B_TRAIN_TARGET_WEEKDAY_MEAN | 8972284.05 | 10400112.83 | -3531820.86 | 3.6279 | 23215502.64 | 135205033.34 | 0 |
| B | 5 | 787/61/111 | 0 | 0 | 10 | B_ORIGIN | 7772192.35 | 9701953.53 | -4264835.72 | 3.1453 | 28518615.75 | 135205033.34 | 0 |
| B | 6 | 787/61/112 | 0 | 0 | 10 | B_ORIGIN | 7837640.76 | 9698768.47 | -4613986.51 | 3.1711 | 31243935.96 | 135205033.34 | 0 |
| C | 1 | 787/61/113 | 7 | 0 | 0.01 | B_ORIGIN_MINUS_6 | 5231461.74 | 7330121.93 | -1518238.10 | 2.1201 | 27535860.29 | 135205033.34 | 0 |
| C | 2 | 787/61/113 | 7 | 0 | 10 | B_ORIGIN_MINUS_6 | 8012150.09 | 9859832.90 | -3137609.16 | 3.2423 | 26268786.95 | 135205033.34 | 0 |
| C | 3 | 787/61/113 | 7 | 0 | 10 | B_ORIGIN_MINUS_6 | 8461459.19 | 9947660.47 | -3221312.35 | 3.4200 | 20752659.33 | 135205033.34 | 0 |
| C | 4 | 787/61/113 | 7 | 0 | 10 | B_TRAIN_TARGET_WEEKDAY_MEAN | 8900939.06 | 10336249.00 | -3604912.93 | 3.5947 | 23215502.64 | 135205033.34 | 0 |
| C | 5 | 787/61/114 | 7 | 1 | 10 | B_ORIGIN | 7675300.63 | 9608934.21 | -4185907.69 | 3.1047 | 28518615.75 | 135205033.34 | 0 |
| C | 6 | 787/61/115 | 7 | 2 | 10 | B_ORIGIN | 7702605.01 | 9592004.25 | -4447070.67 | 3.1196 | 31243935.96 | 135205033.34 | 0 |

## Comparación obligatoria A frente a V2 en las mismas muestras

| h | Targets emparejados | MAE A | MAE V2 | WAPE A % | WAPE V2 % | Dentro de 1.05 | Más cobertura | replacementCandidate |
|---:|---:|---:|---:|---:|---:|---|---|---|
| 1 | 107 | 5511517.82 | 5413085.54 | 2.2310 | 2.1911 | true | false | false |
| 2 | 108 | 14124573.35 | 8079545.18 | 5.7144 | 3.2688 | false | false | false |
| 3 | 109 | 12888689.29 | 8451738.63 | 5.2107 | 3.4169 | false | false | false |
| 4 | 110 | 9205161.11 | 8972284.05 | 3.7220 | 3.6279 | true | false | false |
| 5 | 111 | 10992405.77 | 7772192.35 | 4.4484 | 3.1453 | false | true | false |
| 6 | 112 | 15631972.92 | 7837640.76 | 6.3246 | 3.1711 | false | true | false |

El criterio requiere además calidad técnica frente al baseline y 60 target days prospectivos completos por horizonte; ninguno está disponible aún.

## Ablación target-relative independiente

| h | TRAIN/VALIDATION/RETROSPECTIVE | Alpha | Baseline | MAE retrospectivo | Orígenes |
|---:|---|---:|---|---:|---:|
| 1 | 787/61/116 | 10 | B_ORIGIN_MINUS_6 | 5567335.10 | 10 |
| 2 | 787/61/115 | 0.01 | B_ORIGIN_MINUS_6 | 6415379.76 | 9 |
| 3 | 787/61/115 | 0.01 | B_ORIGIN_MINUS_6 | 7087718.23 | 8 |
| 4 | 787/61/115 | 1 | B_TRAIN_TARGET_WEEKDAY_MEAN | 6635976.31 | 8 |
| 5 | 787/61/115 | 1 | B_ORIGIN | 6541809.39 | 8 |
| 6 | 787/61/116 | 10 | B_ORIGIN | 7552758.96 | 8 |

No reemplaza A, no constituye selección de variante y no se integra al runtime. Predicciones experimentales offline, si las fuentes fueron elegibles: [results.json](results.json).
