# Ridge experimental de precio horario — HU-08

## Datos y protocolo

Snapshot exclusivo: ../corpus/preciobolsnaci-2023-08-01_2024-07-30.csv. SHA-256 verificado antes del cálculo: 07fdc38fa15929ff2bf8a6aefe0a3f2aa292276c5f18c8dbb0919be8537e0506. Integridad comprobada: 8760 filas, 365 días, 24 periodos por día, sin claves duplicadas ni valores no finitos. No se consultó XM/PostgreSQL ni se modificó el pipeline.

| Partición | Inicio | Fin |
| --- | --- | --- |
| train | 2023-08-01 | 2024-04-11 |
| validation | 2024-04-12 | 2024-06-05 |
| test | 2024-06-06 | 2024-07-30 |

Predicción diaria D+1 antes del periodo 1 del día objetivo D, target precio_cop_kwh por periodo, unidad COP/kWh. Se supone disponible D−1 completo. Se permite historia de días anteriores ya transcurridos dentro de validation/test. No es un pronóstico de toda la partición desde un solo origen. Sin datos del propio día objetivo/futuros, HU-04/HU-06, mocks o variables comerciales.

## Features y entrenamiento

Orden único: price_D_minus_1_same_period, price_D_minus_7_same_period, price_D_minus_14_same_period, price_D_minus_28_same_period, period_sin, period_cos, weekday_sin, weekday_cos.

Rezagos por fecha calendario y mismo periodo: D−1/D−7/D−14/D−28, todos estrictamente anteriores a D. Sin imputación. PeriodIndex=period−1 (0..23), sin/cos(2*pi*periodIndex/24). Weekday lunes=0..domingo=6, sin/cos(2*pi*weekday/7). No timestamps ni timezone inferidos.

TRAIN total 6120 filas; efectivo 5448, desde 2023-08-29 hasta 2024-04-11; excluidas 672 filas iniciales sin D−28. Medias y desviaciones poblacionales ddof=0 de las ocho features ajustadas únicamente con TRAIN efectivo. Target original, sin escalar.

| Feature | Media | Std poblacional | Coeficiente |
| --- | --- | --- | --- |
| price_D_minus_1_same_period | 715.0631254698973 | 271.8977638447442 | 246.87275965415483 |
| price_D_minus_7_same_period | 698.7096201174743 | 280.64345278615764 | -1.3348585057140752 |
| price_D_minus_14_same_period | 689.6273896328928 | 277.9308040588684 | 4.604178834692808 |
| price_D_minus_28_same_period | 683.3465990381791 | 279.8079781877387 | -5.69392947350739 |
| period_sin | -1.3401022080638637e-17 | 0.7071067811865476 | -4.103661846800864 |
| period_cos | -5.598791695843364e-17 | 0.7071067811865476 | -1.956678605327895 |
| weekday_sin | 0.009650410280913723 | 0.7078193209904016 | 12.595816667098031 |
| weekday_cos | -0.002202643171806186 | 0.7063241655055804 | 11.01566602664179 |

Intercepto seleccionado: 718.0091442070485. Coeficientes expresados sobre features estandarizadas.

Python 3.14.4 estándar. Objetivo SSE + alpha*sum(w²), intercepto sin penalización. Resolver (ZcᵀZc+alpha I)w=Zcᵀyc con eliminación gaussiana y pivoteo parcial; intercept=mean(y)−mean(z)·w. Sumas math.fsum. Inferencia: intercept+fsum(w[j]*(x[j]−mean[j])/std[j]). Parámetros y residuos numéricos completos en metrics.json.

## Validation y regla previa a test

Alpha predefinidos: 0.01, 0.1, 1, 10, 100, 1000. Menor MAE validation; empate absoluto ≤1e-9 COP/kWh, luego RMSE con igual tolerancia y menor alpha si persiste. Ninguna otra feature o alpha probado.

| Alpha | Evaluables | Indisponibles | MAE | RMSE | bias | WAPE % |
| --- | --- | --- | --- | --- | --- | --- |
| 0.01 | 1320 | 0 | 73.638496447 | 111.485404452 | 40.580284200 | 17.938540940 |
| 0.1 | 1320 | 0 | 73.641657556 | 111.487356220 | 40.584469823 | 17.939310995 |
| 1 | 1320 | 0 | 73.673259268 | 111.506891131 | 40.626313799 | 17.947009259 |
| 10 | 1320 | 0 | 73.988413303 | 111.703943396 | 41.043533150 | 18.023781652 |
| 100 | 1320 | 0 | 77.338578093 | 113.826573232 | 45.098736321 | 18.839891040 |
| 1000 | 1320 | 0 | 111.029204912 | 140.431426600 | 77.308828144 | 27.047020702 |

B1 validation completo: MAE=62.984024742424246, RMSE=108.18670646524782, bias=11.56717118181818, WAPE=15.34308223191027%. Referencia leída del metrics.json versionado de baselines, no de valores redondeados.

Alpha elegido: **0.01**. Mejora MAE=(B1_MAE−Ridge_MAE)/B1_MAE*100 = **-16.91614936935588%**. Umbral inalterado: ≥5%, cero fallos numéricos/leakage observado, WAPE finito y denominador positivo. Resultado: **NO PASA**.

Error=prediction−actual. MAE=mean(abs(error)), RMSE=sqrt(mean(error²)), bias=mean(error), WAPE=100*sum(abs(error))/sum(abs(actual)). WAPE es error porcentual, no accuracy. Numerador/denominador, disponibilidad y percentiles completos en metrics.json. Percentiles con interpolación lineal en (n−1)p. Sin redondeo intermedio.

## Test y decisión

No se evaluó Ridge en TEST porque no alcanzó el umbral de validation. No se calculó comparación Ridge/B1 test ni se creó model.json. Se mantiene **B1** como referencia. Experimento detenido sin nuevos candidatos, features, alpha o ajustes. Los parámetros del candidato descartado se conservan en metrics.json para trazabilidad, no como artefacto promovido.

### validation por periodo

| periodo | n | Indisponibles | MAE | RMSE | bias | WAPE % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 55 | 0 | 67.861068631 | 107.546426827 | 45.189340681 | 19.648575982 |
| 2 | 55 | 0 | 63.854101881 | 103.357655373 | 44.393026686 | 18.815152729 |
| 3 | 55 | 0 | 70.576495516 | 107.605312329 | 44.014662148 | 21.080578355 |
| 4 | 55 | 0 | 62.416147049 | 95.817849858 | 43.721208065 | 18.420648707 |
| 5 | 55 | 0 | 68.989987582 | 108.303160509 | 41.946983992 | 19.774053993 |
| 6 | 55 | 0 | 66.623947269 | 103.890151782 | 40.639378801 | 18.345586268 |
| 7 | 55 | 0 | 66.253238047 | 106.816886011 | 41.706880210 | 18.261643311 |
| 8 | 55 | 0 | 82.291304299 | 132.932568042 | 41.173263760 | 22.298680242 |
| 9 | 55 | 0 | 77.294001207 | 120.977000318 | 41.326937656 | 20.589374513 |
| 10 | 55 | 0 | 77.675397175 | 121.108553469 | 42.812139833 | 20.684415046 |
| 11 | 55 | 0 | 73.950375956 | 113.201253916 | 42.533448815 | 19.118322365 |
| 12 | 55 | 0 | 81.425510655 | 128.186446071 | 42.874416414 | 20.284733065 |
| 13 | 55 | 0 | 79.059296778 | 118.822484083 | 44.736573954 | 19.807648484 |
| 14 | 55 | 0 | 77.238868136 | 102.738712895 | 45.181394780 | 18.920856596 |
| 15 | 55 | 0 | 82.288687985 | 112.658376730 | 44.939065114 | 19.132502631 |
| 16 | 55 | 0 | 73.262618219 | 104.110982830 | 43.373786851 | 16.148477604 |
| 17 | 55 | 0 | 81.165431622 | 121.037319331 | 43.587313189 | 17.818212075 |
| 18 | 55 | 0 | 70.853565201 | 104.670313536 | 42.139961462 | 15.103726330 |
| 19 | 55 | 0 | 78.757994082 | 115.531050137 | 31.434472306 | 15.338354634 |
| 20 | 55 | 0 | 79.026214489 | 122.064863465 | 24.444226113 | 14.691267730 |
| 21 | 55 | 0 | 77.236727169 | 110.620121243 | 25.190796614 | 14.778434356 |
| 22 | 55 | 0 | 65.775883847 | 95.567777659 | 36.989709656 | 13.729015244 |
| 23 | 55 | 0 | 68.174890715 | 89.711763973 | 39.524297783 | 15.647775501 |
| 24 | 55 | 0 | 75.272161209 | 116.866689404 | 40.053535911 | 18.534881378 |

### validation por weekday

| weekday | n | Indisponibles | MAE | RMSE | bias | WAPE % |
| --- | --- | --- | --- | --- | --- | --- |
| lunes | 192 | 0 | 75.177687247 | 107.997706835 | 16.426895320 | 18.462077446 |
| martes | 192 | 0 | 77.648160914 | 103.470399323 | 63.267531425 | 19.524632899 |
| miércoles | 192 | 0 | 81.943176941 | 130.539543794 | 53.605948545 | 21.062827418 |
| jueves | 168 | 0 | 55.799689351 | 76.706142686 | 31.898221068 | 14.637494636 |
| viernes | 192 | 0 | 60.947127273 | 84.965597001 | 3.522934301 | 13.187543909 |
| sábado | 192 | 0 | 43.674448843 | 66.536288562 | 8.539046757 | 9.533050603 |
| domingo | 192 | 0 | 118.049333670 | 171.010406258 | 105.716154090 | 31.527848473 |

## Límites y exposición previa

Julio 2024 (01..30) fue inspeccionado descriptivamente antes; además, el experimento previo ya observó las métricas test de B1/B7. No es completamente unseen. Esta exposición no se usó para elegir alpha, features o cambiar el criterio. Un año no demuestra estacionalidad anual repetible ni generalización fuera del periodo. Se necesita verificar disponibilidad real de precios al origen antes de cualquier implementación.

No es precio personalizado, recomendación financiera ni liquidación comercial. No se implementa HU-08, servicio, controller, endpoint, Prisma o frontend. Validación académica/formal pendiente.

## Reproducción

Verificar hash e integridad; construir diccionario fecha/periodo; generar las ocho features según fórmulas anteriores; excluir TRAIN sin rezagos; ajustar ddof=0 solo allí; resolver los seis sistemas con intercepto libre; evaluar validation y aplicar la regla fijada; abrir evaluación test únicamente si pasa. metrics.json conserva rangos, scaler, coeficientes, intercepto, fórmulas, candidatos, residuos y decisión.
