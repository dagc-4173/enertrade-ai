# Resultados de reevaluación semántica

## V1

| h | alpha | baseline | MAE Ridge | MAE baseline | RMSE | Bias | WAPE | max abs error | catastrophic threshold | technicalCandidate |
|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 0.01 | B_ORIGIN_MINUS_6 | 5610296.76 | 6851958.85 | 7698530.01 | 685836.94 | 2.271390 | 26675739.51 | 135205033.34 | true |
| 2 | 0.01 | B_ORIGIN_MINUS_6 | 14144529.02 | 12559017.29 | 16074651.74 | -12786826.71 | 5.727447 | 30064396.75 | 135205033.34 | false |
| 3 | 0.01 | B_ORIGIN_MINUS_6 | 12801346.49 | 16607259.75 | 14584216.70 | -11022408.24 | 5.178884 | 27244603.81 | 135205033.34 | true |
| 4 | 0.01 | B_TRAIN_TARGET_WEEKDAY_MEAN | 9136913.27 | 19468517.20 | 10597104.56 | -3776332.43 | 3.691643 | 24369293.41 | 135205033.34 | true |
| 5 | 0.01 | B_ORIGIN | 10892959.28 | 16812400.64 | 12790770.29 | -8255069.70 | 4.402346 | 27060325.79 | 135205033.34 | true |
| 6 | 0.01 | B_ORIGIN | 15591274.16 | 12154957.35 | 17621113.46 | -14732224.52 | 6.309038 | 30377359.45 | 135205033.34 | false |
| 7 | 0.01 | B_ORIGIN | 9041393.35 | 6807512.68 | 11038890.81 | -7051104.01 | 3.658755 | 29410468.67 | 135205033.34 | false |

## V2

| h | alpha | baseline | MAE Ridge | MAE baseline | RMSE | Bias | WAPE | max abs error | catastrophic threshold | technicalCandidate |
|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 0.01 | B_ORIGIN_MINUS_6 | 5413085.54 | 7038092.82 | 7510499.08 | -1600183.08 | 2.191128 | 27535860.29 | 135205033.34 | true |
| 2 | 10 | B_ORIGIN_MINUS_6 | 8079545.18 | 12252433.27 | 9945467.55 | -3194421.40 | 3.268777 | 26268786.95 | 135205033.34 | true |
| 3 | 10 | B_ORIGIN_MINUS_6 | 8451738.63 | 16282810.29 | 9935752.03 | -3312695.80 | 3.416876 | 20752659.33 | 135205033.34 | true |
| 4 | 10 | B_TRAIN_TARGET_WEEKDAY_MEAN | 8972284.05 | 19341530.65 | 10400112.83 | -3531820.86 | 3.627853 | 23215502.64 | 135205033.34 | true |
| 5 | 10 | B_ORIGIN | 7772192.35 | 16935730.04 | 9701953.53 | -4264835.72 | 3.145277 | 28518615.75 | 135205033.34 | true |
| 6 | 10 | B_ORIGIN | 7837640.76 | 12053854.05 | 9698768.47 | -4613986.51 | 3.171051 | 31243935.96 | 135205033.34 | true |
| 7 | 100 | B_ORIGIN | 7196649.15 | 6838052.08 | 9044521.20 | -4598211.03 | 2.910446 | 26621379.43 | 134871190.46 | false |

## Original V2 vs reevaluación V2 semántica

| h | original V2 MAE | semantic MAE | baseline (MAE) | semantic WAPE | technicalCandidate |
|---:|---:|---:|---|---:|---|
| 1 | 14195030.08 | 5413085.54 | B_ORIGIN_MINUS_6 (7038092.82) | 2.191128 | true |
| 2 | 16818637.67 | 8079545.18 | B_ORIGIN_MINUS_6 (12252433.27) | 3.268777 | true |
| 3 | 16812159.50 | 8451738.63 | B_ORIGIN_MINUS_6 (16282810.29) | 3.416876 | true |
| 4 | 17083701.33 | 8972284.05 | B_TRAIN_TARGET_WEEKDAY_MEAN (19341530.65) | 3.627853 | true |
| 5 | 16989020.86 | 7772192.35 | B_ORIGIN (16935730.04) | 3.145277 | true |
| 6 | 17075656.94 | 7837640.76 | B_ORIGIN (12053854.05) | 3.171051 | true |
| 7 | 14858952.63 | 7196649.15 | B_ORIGIN (6838052.08) | 2.910446 | false |

Los cambios proceden exclusivamente del filtrado semántico de muestras y del reajuste/scaler sobre TRAIN elegible. En este corpus las exclusiones están fuera de TRAIN/VALIDATION, por lo que parámetros seleccionados solo cambiarían si una fecha excluida afectara sus inputs o targets.
