# Resultados HU-06 multi-horizonte V1

## VALIDATION

| h | alpha | baseline | MAE Ridge | MAE baseline | RMSE Ridge | Bias Ridge | WAPE Ridge | candidate final |
|---:|---:|---|---:|---:|---:|---:|---:|---|
| 1 | 0.01 | B_ORIGIN_MINUS_6 | 6279889.90 | 8298865.95 | 9100940.07 | -530219.40 | 2.574095 | false |
| 2 | 0.01 | B_ORIGIN_MINUS_6 | 13260704.38 | 13639397.22 | 15701814.54 | -10486702.83 | 5.435495 | false |
| 3 | 0.01 | B_ORIGIN_MINUS_6 | 12339382.45 | 17051023.81 | 14618819.06 | -9094309.45 | 5.057850 | false |
| 4 | 0.01 | B_TRAIN_TARGET_WEEKDAY_MEAN | 9370869.55 | 17458474.54 | 12065833.60 | -3952830.29 | 3.841072 | false |
| 5 | 0.01 | B_ORIGIN | 11692467.23 | 16673314.69 | 13745688.37 | -7637274.63 | 4.792683 | false |
| 6 | 0.01 | B_ORIGIN | 14926118.95 | 13313153.75 | 17064638.39 | -12194438.03 | 6.118140 | false |
| 7 | 0.01 | B_ORIGIN | 10497602.69 | 8298865.95 | 13649238.93 | -6304908.49 | 4.302914 | false |

## EXTERNAL HOLDOUT

| h | alpha | baseline | MAE Ridge | MAE baseline | RMSE Ridge | Bias Ridge | WAPE Ridge | candidate |
|---:|---:|---|---:|---:|---:|---:|---:|---|
| 1 | 0.01 | B_ORIGIN_MINUS_6 | 12520534.99 | 15147902.95 | 38737980.11 | 4690653.78 | 5.192996 | false |
| 2 | 0.01 | B_ORIGIN_MINUS_6 | 20678485.84 | 20289059.71 | 41635433.70 | -7653000.94 | 8.576573 | false |
| 3 | 0.01 | B_ORIGIN_MINUS_6 | 19502975.79 | 24139235.81 | 42005982.02 | -6008580.74 | 8.089021 | false |
| 4 | 0.01 | B_TRAIN_TARGET_WEEKDAY_MEAN | 16021411.94 | 24688023.37 | 41712315.17 | 1500178.10 | 6.645013 | false |
| 5 | 0.01 | B_ORIGIN | 17306099.20 | 24987982.25 | 41179254.19 | -2571163.68 | 7.177848 | false |
| 6 | 0.01 | B_ORIGIN | 21385318.72 | 20351820.73 | 40625091.45 | -9231146.58 | 8.869738 | false |
| 7 | 0.01 | B_ORIGIN | 16379266.19 | 15147902.95 | 43919697.18 | -1939942.85 | 6.793436 | false |

Las métricas completas, baselines y criterios están en [results.json](results.json). Candidate no intervino en selección y se calculó una vez con la regla predefinida.
