# Resultados V2

## Selección VALIDATION

| h | alpha V2 | baseline | MAE baseline | MAE V1 | MAE V2 | Δ V2/V1 |
|---:|---:|---|---:|---:|---:|---:|
| 1 | 0.01 | B_ORIGIN_6 | 362758.28 | 335587.14 | 240568.83 | -28.31% |
| 2 | 0.01 | B_ORIGIN_6 | 592187.28 | 635140.60 | 411504.54 | -35.21% |
| 3 | 10 | B_ORIGIN_6 | 738257.08 | 758380.50 | 395384.08 | -47.86% |
| 4 | 100 | B_HISTORICAL_MEAN | 750162.05 | 767476.11 | 417539.43 | -45.60% |
| 5 | 0.01 | B_ORIGIN_0 | 729659.54 | 747213.01 | 388442.48 | -48.01% |
| 6 | 0.01 | B_ORIGIN_0 | 585952.57 | 676275.78 | 410337.36 | -39.32% |
| 7 | 100 | B_ORIGIN_0 | 362758.28 | 413997.98 | 373607.37 | -9.76% |

## EXTERNAL HOLDOUT: V1 vs V2

| h | baseline | baseline MAE | Ridge V1 MAE | Ridge V2 MAE | WAPE V1 | WAPE V2 | Δ MAE V2/V1 | evaluación | candidate V1 | candidate V2 |
|---:|---|---:|---:|---:|---:|---:|---:|---|---|---|
| 1 | B_ORIGIN_6 | 344969.73 | 340903.07 | 317529.62 | 3.2948 | 3.0689 | -6.86% | mejoró | true | true |
| 2 | B_ORIGIN_6 | 561839.97 | 649653.60 | 393014.62 | 6.2789 | 3.7985 | -39.50% | mejoró | false | true |
| 3 | B_ORIGIN_6 | 759406.61 | 878441.57 | 358650.36 | 8.4901 | 3.4663 | -59.17% | mejoró | false | true |
| 4 | B_HISTORICAL_MEAN | 884033.89 | 893608.80 | 397364.33 | 8.6367 | 3.8405 | -55.53% | mejoró | false | true |
| 5 | B_ORIGIN_0 | 783873.66 | 859499.02 | 361748.35 | 8.3070 | 3.4963 | -57.91% | mejoró | false | true |
| 6 | B_ORIGIN_0 | 565933.32 | 734200.09 | 379281.62 | 7.0960 | 3.6657 | -48.34% | mejoró | false | true |
| 7 | B_ORIGIN_0 | 344969.73 | 400887.91 | 317901.45 | 3.8746 | 3.0725 | -20.70% | mejoró | false | true |

La clasificación diagnóstica se fijó antes de leer esta tabla: mejora <=−1%, empeora >=1%, otro resultado sin cambio relevante. No interviene en promoción.

## Coeficientes estandarizados

Diagnóstico únicamente; no se eliminan features después de observar holdout.

### h=1

| feature | standardized coefficient | absolute |
|---|---:|---:|
| energy_same_period_6_days_before_origin | 422110.793831 | 422110.793831 |
| energy_same_period_at_origin | 397108.466489 | 397108.466489 |
| energy_same_period_27_days_before_origin | 245325.199935 | 245325.199935 |
| energy_same_period_13_days_before_origin | 212711.070876 | 212711.070876 |
| energy_same_period_14_days_before_origin | -192718.276038 | 192718.276038 |
| energy_same_period_7_days_before_origin | -153185.551033 | 153185.551033 |
| energy_period24_at_origin | 150548.699635 | 150548.699635 |
| sin_2pi_hour_minus1_over24 | -123998.130358 | 123998.130358 |
| energy_same_period_mean_7d_ending_at_origin | 85319.235855 | 85319.235855 |
| energy_same_period_28_days_before_origin | -85268.622751 | 85268.622751 |
| sin_2pi_target_weekday_over7 | 79475.077811 | 79475.077811 |
| energy_same_period_std_7d_ending_at_origin | 73361.640706 | 73361.640706 |
| energy_same_period_mean_14d_ending_at_origin | -70295.178043 | 70295.178043 |
| energy_same_period_2_days_before_origin | 67052.935980 | 67052.935980 |
| cos_2pi_hour_minus1_over24 | -24235.844274 | 24235.844274 |
| cos_2pi_target_weekday_over7 | 5790.871313 | 5790.871313 |
| energy_same_period_1_day_before_origin | -4389.017322 | 4389.017322 |

### h=2

| feature | standardized coefficient | absolute |
|---|---:|---:|
| energy_same_period_mean_14d_ending_at_origin | 728610.047764 | 728610.047764 |
| energy_same_period_mean_7d_ending_at_origin | 624136.080801 | 624136.080801 |
| cos_2pi_target_weekday_over7 | -285164.513695 | 285164.513695 |
| energy_same_period_7_days_before_origin | -269908.788338 | 269908.788338 |
| sin_2pi_target_weekday_over7 | 171022.252402 | 171022.252402 |
| energy_same_period_14_days_before_origin | -152862.109858 | 152862.109858 |
| energy_same_period_13_days_before_origin | -147400.508018 | 147400.508018 |
| energy_same_period_std_7d_ending_at_origin | 127772.530977 | 127772.530977 |
| sin_2pi_hour_minus1_over24 | -119345.776073 | 119345.776073 |
| energy_same_period_2_days_before_origin | -117263.806986 | 117263.806986 |
| energy_same_period_27_days_before_origin | 91868.450718 | 91868.450718 |
| energy_same_period_28_days_before_origin | -49652.101964 | 49652.101964 |
| energy_same_period_6_days_before_origin | -47843.071452 | 47843.071452 |
| energy_same_period_at_origin | 47706.999842 | 47706.999842 |
| energy_period24_at_origin | 18123.282297 | 18123.282297 |
| cos_2pi_hour_minus1_over24 | 17662.639559 | 17662.639559 |
| energy_same_period_1_day_before_origin | -1907.148549 | 1907.148549 |

### h=3

| feature | standardized coefficient | absolute |
|---|---:|---:|
| energy_same_period_mean_7d_ending_at_origin | 1247587.085320 | 1247587.085320 |
| energy_same_period_mean_14d_ending_at_origin | 397627.062680 | 397627.062680 |
| energy_same_period_2_days_before_origin | -371276.141743 | 371276.141743 |
| energy_same_period_6_days_before_origin | -326615.697909 | 326615.697909 |
| sin_2pi_target_weekday_over7 | 202222.673926 | 202222.673926 |
| cos_2pi_target_weekday_over7 | -172232.610286 | 172232.610286 |
| energy_same_period_13_days_before_origin | -171417.790667 | 171417.790667 |
| sin_2pi_hour_minus1_over24 | -136658.857501 | 136658.857501 |
| energy_same_period_std_7d_ending_at_origin | 109785.986637 | 109785.986637 |
| energy_same_period_1_day_before_origin | -90486.898871 | 90486.898871 |
| energy_same_period_28_days_before_origin | 85134.836337 | 85134.836337 |
| energy_same_period_at_origin | -81929.433907 | 81929.433907 |
| energy_same_period_7_days_before_origin | -75342.330678 | 75342.330678 |
| energy_period24_at_origin | 52907.935870 | 52907.935870 |
| energy_same_period_27_days_before_origin | 29571.126260 | 29571.126260 |
| cos_2pi_hour_minus1_over24 | -5612.974803 | 5612.974803 |
| energy_same_period_14_days_before_origin | 1012.291339 | 1012.291339 |

### h=4

| feature | standardized coefficient | absolute |
|---|---:|---:|
| energy_same_period_mean_7d_ending_at_origin | 725725.583879 | 725725.583879 |
| sin_2pi_target_weekday_over7 | 320076.629278 | 320076.629278 |
| energy_same_period_1_day_before_origin | -253310.227874 | 253310.227874 |
| cos_2pi_target_weekday_over7 | -187236.249249 | 187236.249249 |
| energy_same_period_mean_14d_ending_at_origin | 158340.884689 | 158340.884689 |
| sin_2pi_hour_minus1_over24 | -128196.598481 | 128196.598481 |
| energy_same_period_27_days_before_origin | 101864.137139 | 101864.137139 |
| energy_same_period_6_days_before_origin | -98964.452468 | 98964.452468 |
| energy_same_period_28_days_before_origin | 95442.949872 | 95442.949872 |
| energy_same_period_std_7d_ending_at_origin | 90226.807708 | 90226.807708 |
| energy_same_period_at_origin | 88270.712365 | 88270.712365 |
| energy_same_period_14_days_before_origin | -64446.224637 | 64446.224637 |
| energy_period24_at_origin | 46735.407122 | 46735.407122 |
| energy_same_period_2_days_before_origin | 29773.672157 | 29773.672157 |
| cos_2pi_hour_minus1_over24 | -14276.263463 | 14276.263463 |
| energy_same_period_13_days_before_origin | -9827.874535 | 9827.874535 |
| energy_same_period_7_days_before_origin | 5626.638288 | 5626.638288 |

### h=5

| feature | standardized coefficient | absolute |
|---|---:|---:|
| energy_same_period_2_days_before_origin | 707122.644289 | 707122.644289 |
| energy_same_period_14_days_before_origin | -179620.654878 | 179620.654878 |
| energy_same_period_mean_14d_ending_at_origin | 160935.119920 | 160935.119920 |
| sin_2pi_target_weekday_over7 | 129256.067051 | 129256.067051 |
| energy_same_period_at_origin | 121457.744705 | 121457.744705 |
| sin_2pi_hour_minus1_over24 | -116997.900647 | 116997.900647 |
| energy_same_period_std_7d_ending_at_origin | 115519.802612 | 115519.802612 |
| energy_same_period_27_days_before_origin | 105324.513352 | 105324.513352 |
| cos_2pi_target_weekday_over7 | -99912.202940 | 99912.202940 |
| energy_same_period_mean_7d_ending_at_origin | -95775.902519 | 95775.902519 |
| energy_same_period_6_days_before_origin | 89746.072892 | 89746.072892 |
| energy_same_period_28_days_before_origin | 43859.126368 | 43859.126368 |
| energy_same_period_13_days_before_origin | -35220.897981 | 35220.897981 |
| energy_period24_at_origin | -30564.265093 | 30564.265093 |
| energy_same_period_7_days_before_origin | -13076.793917 | 13076.793917 |
| cos_2pi_hour_minus1_over24 | 11137.897290 | 11137.897290 |
| energy_same_period_1_day_before_origin | 8767.873712 | 8767.873712 |

### h=6

| feature | standardized coefficient | absolute |
|---|---:|---:|
| energy_same_period_1_day_before_origin | 696658.776333 | 696658.776333 |
| energy_same_period_mean_7d_ending_at_origin | 197720.953324 | 197720.953324 |
| energy_same_period_13_days_before_origin | -188566.046863 | 188566.046863 |
| energy_same_period_mean_14d_ending_at_origin | 149508.565331 | 149508.565331 |
| sin_2pi_target_weekday_over7 | 140655.323048 | 140655.323048 |
| energy_same_period_std_7d_ending_at_origin | 121925.631984 | 121925.631984 |
| sin_2pi_hour_minus1_over24 | -101111.988081 | 101111.988081 |
| energy_same_period_2_days_before_origin | -85370.631245 | 85370.631245 |
| cos_2pi_target_weekday_over7 | -73462.843117 | 73462.843117 |
| energy_same_period_27_days_before_origin | 70871.398816 | 70871.398816 |
| energy_period24_at_origin | -70516.303725 | 70516.303725 |
| energy_same_period_7_days_before_origin | -69276.394807 | 69276.394807 |
| energy_same_period_28_days_before_origin | 60639.714639 | 60639.714639 |
| energy_same_period_at_origin | 42516.798363 | 42516.798363 |
| energy_same_period_6_days_before_origin | 41377.824405 | 41377.824405 |
| cos_2pi_hour_minus1_over24 | 25941.608885 | 25941.608885 |
| energy_same_period_14_days_before_origin | -22154.918512 | 22154.918512 |

### h=7

| feature | standardized coefficient | absolute |
|---|---:|---:|
| energy_same_period_at_origin | 524931.780363 | 524931.780363 |
| energy_same_period_mean_7d_ending_at_origin | 356380.419439 | 356380.419439 |
| energy_same_period_mean_14d_ending_at_origin | -224743.040492 | 224743.040492 |
| energy_same_period_28_days_before_origin | 198669.261566 | 198669.261566 |
| energy_same_period_14_days_before_origin | 160934.860881 | 160934.860881 |
| energy_same_period_13_days_before_origin | -105410.621014 | 105410.621014 |
| sin_2pi_hour_minus1_over24 | -89893.159874 | 89893.159874 |
| sin_2pi_target_weekday_over7 | 70643.900407 | 70643.900407 |
| energy_same_period_7_days_before_origin | 61559.945656 | 61559.945656 |
| energy_same_period_std_7d_ending_at_origin | 57501.036059 | 57501.036059 |
| cos_2pi_target_weekday_over7 | -45655.476146 | 45655.476146 |
| energy_period24_at_origin | -33429.992108 | 33429.992108 |
| energy_same_period_2_days_before_origin | -25229.064139 | 25229.064139 |
| energy_same_period_1_day_before_origin | -19079.423283 | 19079.423283 |
| energy_same_period_27_days_before_origin | 18406.337728 | 18406.337728 |
| energy_same_period_6_days_before_origin | 17682.152524 | 17682.152524 |
| cos_2pi_hour_minus1_over24 | -12797.498787 | 12797.498787 |
