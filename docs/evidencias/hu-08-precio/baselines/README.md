# Baselines horarios D+1 de PrecBolsNaci — HU-08

## Propósito y snapshot

Referencias de predicción del precio energético histórico de mercado en COP/kWh, por fecha_xm y periodo 1..24. No representan IA, liquidación, recomendación financiera o precio personalizado. HU-08 continúa sin modelo entrenado ni endpoint. Validación académica/formal pendiente.

Snapshot exclusivo: ../corpus/preciobolsnaci-2023-08-01_2024-07-30.csv. SHA-256 verificado antes de calcular: `07fdc38fa15929ff2bf8a6aefe0a3f2aa292276c5f18c8dbb0919be8537e0506`. Comprobadas 8760 filas finitas, 365 fechas consecutivas y 24 periodos exactos por fecha, sin duplicados. No se leyó PostgreSQL ni se consultó XM. El CSV no se modificó.

## Protocolo congelado

Origen diario antes del periodo 1 del día objetivo D; horizonte D+1 con 24 predicciones por fecha+periodo. B1=price(D−1,p). B7=price(D−7,p). Se evalúan independientemente; B7MEDIAN no se incluyó. Búsqueda por claves calendario, nunca shift posicional. Si falta la referencia, unavailable sin imputación ni sustitución.

Se permite pasado anterior al inicio de la partición y días anteriores ya transcurridos dentro de ella. Es evaluación diaria con historia observada actualizada, no pronóstico de los 55 días completos desde un único origen. Se supone disponible D−1 completo. No se usan precios del mismo día objetivo ni futuros, HU-04/HU-06, ofertas/demandas, mocks o timestamps inferidos.

| Partición | Inicio | Fin | Días | Filas |
| --- | --- | --- | --- | --- |
| train | 2023-08-01 | 2024-04-11 | 255 | 6120 |
| validation | 2024-04-12 | 2024-06-05 | 55 | 1320 |
| test | 2024-06-06 | 2024-07-30 | 55 | 1320 |

Train aporta historia: no se ajusta ningún parámetro ni se entrena un modelo.

## Métricas y selección

error=prediction−actual. MAE=sum(abs(error))/n; RMSE=sqrt(sum(error²)/n); bias=sum(error)/n. WAPE=100×sum(abs(error))/sum(abs(actual)). n corresponde a evaluables. Denominador positivo comprobado; si fuera cero, WAPE sería no disponible. WAPE es error porcentual, no accuracy. Los componentes sumados no son precios diarios ni liquidación monetaria.

Python 3.14.4 estándar, float IEEE-754 y math.fsum. Sin redondeo intermedio. Presentación a seis decimales; metrics.json conserva valores completos. Percentiles de errores absolutos mediante interpolación lineal en (n−1)p.

Regla fijada antes de test: menor MAE validation; empate práctico absoluto ≤1e-9 COP/kWh, luego menor RMSE con igual tolerancia y finalmente ID lexicográfico.

### Validation

| Baseline | Evaluables | Indisponibles | MAE | RMSE | bias | WAPE % |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | 1320 | 0 | 62.984025 | 108.186706 | 11.567171 | 15.343082 |
| B7 | 1320 | 0 | 218.019998 | 318.010771 | 75.736509 | 53.110273 |

Selección congelada antes de calcular test: **B1**. Desempate requerido: no.

### Test

| Baseline | Evaluables | Indisponibles | MAE | RMSE | bias | WAPE % |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | 1320 | 0 | 48.149714 | 79.924275 | -0.102177 | 17.154462 |
| B7 | 1320 | 0 | 74.713681 | 104.916789 | -8.918212 | 26.618496 |

Evaluación final: **B1**. Cada baseline se calculó una sola vez en test; el otro se reporta únicamente para comparación documental. No se cambió la selección.

### Componentes WAPE

| Partición | Baseline | Numerador error absoluto | Denominador actual absoluto |
| --- | --- | --- | --- |
| validation | B1 | 83138.91266 | 541865.78292 |
| validation | B7 | 287786.39768 | 541865.78292 |
| test | B1 | 63557.62216 | 370501.99076 |
| test | B7 | 98622.0592 | 370501.99076 |

### Extremos y percentiles de error absoluto

| Partición | Baseline | Mínimo | Máximo | P50 | P90 | P95 | P99 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| validation | B1 | 0.000030 | 579.787640 | 30.611880 | 160.326114 | 248.689676 | 445.067030 |
| validation | B7 | 0.536140 | 959.780170 | 138.640575 | 590.141070 | 815.371780 | 910.680273 |
| test | B1 | 0.006980 | 780.625650 | 32.854150 | 107.605690 | 128.187770 | 233.424925 |
| test | B7 | 0.029670 | 721.300820 | 60.376100 | 143.488810 | 182.962060 | 355.132168 |

metrics.json registra además la primera ocurrencia del mínimo/máximo (fecha, periodo, referencia, actual, predicción) y el número de empates.

## Métricas por periodo

Agrupadas por fecha/periodo objetivo. No se usan para reselección retrospectiva. n cuenta observaciones horarias.

### validation

| Baseline | periodo | Evaluables | Indisponibles | MAE | RMSE | bias | WAPE % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | 1 | 55 | 0 | 46.899779 | 101.991612 | 12.906728 | 13.579419 |
| B1 | 2 | 55 | 0 | 45.084967 | 97.114726 | 12.906728 | 13.284668 |
| B1 | 3 | 55 | 0 | 53.814945 | 102.955671 | 12.906728 | 16.074051 |
| B1 | 4 | 55 | 0 | 45.228382 | 88.930802 | 13.797637 | 13.348087 |
| B1 | 5 | 55 | 0 | 56.036684 | 104.667212 | 13.460073 | 16.061351 |
| B1 | 6 | 55 | 0 | 58.752518 | 100.498822 | 13.460073 | 16.178108 |
| B1 | 7 | 55 | 0 | 58.233102 | 103.977284 | 13.888910 | 16.051021 |
| B1 | 8 | 55 | 0 | 76.993261 | 134.378588 | 12.906728 | 20.863056 |
| B1 | 9 | 55 | 0 | 71.123784 | 120.527233 | 12.452183 | 18.945768 |
| B1 | 10 | 55 | 0 | 71.646780 | 119.955661 | 12.452183 | 19.079036 |
| B1 | 11 | 55 | 0 | 67.451923 | 111.241425 | 11.724910 | 17.438283 |
| B1 | 12 | 55 | 0 | 72.849281 | 126.232415 | 11.906728 | 18.148222 |
| B1 | 13 | 55 | 0 | 67.394177 | 114.469088 | 11.906728 | 16.885050 |
| B1 | 14 | 55 | 0 | 66.876593 | 96.019496 | 11.906728 | 16.382457 |
| B1 | 15 | 55 | 0 | 71.306061 | 107.857441 | 12.743092 | 16.578991 |
| B1 | 16 | 55 | 0 | 67.216786 | 98.227746 | 12.652183 | 14.815861 |
| B1 | 17 | 55 | 0 | 74.910347 | 118.444470 | 12.652183 | 16.445036 |
| B1 | 18 | 55 | 0 | 65.537239 | 98.068694 | 12.652183 | 13.970455 |
| B1 | 19 | 55 | 0 | 70.161408 | 115.845654 | 6.324910 | 13.664144 |
| B1 | 20 | 55 | 0 | 68.500260 | 124.293504 | 2.195764 | 12.734454 |
| B1 | 21 | 55 | 0 | 67.516773 | 110.883929 | 2.670364 | 12.918624 |
| B1 | 22 | 55 | 0 | 55.321414 | 89.694100 | 12.670364 | 11.546915 |
| B1 | 23 | 55 | 0 | 52.593140 | 79.489344 | 12.561273 | 12.071389 |
| B1 | 24 | 55 | 0 | 60.166988 | 112.399808 | 11.906728 | 14.815411 |
| B7 | 1 | 55 | 0 | 223.619118 | 352.894609 | 75.936223 | 64.746950 |
| B7 | 2 | 55 | 0 | 212.082127 | 346.046776 | 74.527641 | 62.491798 |
| B7 | 3 | 55 | 0 | 228.358311 | 346.651047 | 61.752296 | 68.208619 |
| B7 | 4 | 55 | 0 | 233.875711 | 351.639012 | 62.514278 | 69.022881 |
| B7 | 5 | 55 | 0 | 216.918479 | 326.666549 | 74.655605 | 62.173626 |
| B7 | 6 | 55 | 0 | 220.258831 | 322.216536 | 76.818478 | 60.650525 |
| B7 | 7 | 55 | 0 | 222.763340 | 323.452585 | 76.721678 | 61.401145 |
| B7 | 8 | 55 | 0 | 219.480485 | 320.954208 | 73.449387 | 59.473175 |
| B7 | 9 | 55 | 0 | 223.644783 | 323.356845 | 71.351023 | 59.573914 |
| B7 | 10 | 55 | 0 | 217.650838 | 320.477886 | 77.087332 | 57.958896 |
| B7 | 11 | 55 | 0 | 212.743127 | 307.600096 | 80.354405 | 55.000284 |
| B7 | 12 | 55 | 0 | 207.821895 | 302.504427 | 86.573314 | 51.772616 |
| B7 | 13 | 55 | 0 | 205.530010 | 301.973048 | 82.827132 | 51.493833 |
| B7 | 14 | 55 | 0 | 212.196466 | 308.770381 | 82.518041 | 51.980810 |
| B7 | 15 | 55 | 0 | 212.989714 | 304.883282 | 80.912660 | 49.521099 |
| B7 | 16 | 55 | 0 | 217.419932 | 306.085235 | 78.172587 | 47.923498 |
| B7 | 17 | 55 | 0 | 219.652623 | 305.607990 | 81.945314 | 48.220245 |
| B7 | 18 | 55 | 0 | 231.188187 | 319.105281 | 76.808951 | 49.281968 |
| B7 | 19 | 55 | 0 | 215.698272 | 293.586523 | 74.108951 | 42.007883 |
| B7 | 20 | 55 | 0 | 216.892404 | 290.705067 | 70.050714 | 40.321106 |
| B7 | 21 | 55 | 0 | 213.102272 | 301.794503 | 65.308951 | 40.774875 |
| B7 | 22 | 55 | 0 | 212.728351 | 313.201476 | 78.632423 | 44.401543 |
| B7 | 23 | 55 | 0 | 216.129320 | 314.029282 | 73.970951 | 49.606872 |
| B7 | 24 | 55 | 0 | 219.735362 | 317.167258 | 80.677878 | 54.107240 |

### test

| Baseline | periodo | Evaluables | Indisponibles | MAE | RMSE | bias | WAPE % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | 1 | 55 | 0 | 36.478817 | 51.224946 | -0.336431 | 16.365587 |
| B1 | 2 | 55 | 0 | 37.258222 | 51.140283 | -1.790976 | 16.319189 |
| B1 | 3 | 55 | 0 | 31.618880 | 46.285058 | -0.572794 | 14.337447 |
| B1 | 4 | 55 | 0 | 35.316390 | 49.538076 | -1.227340 | 16.208813 |
| B1 | 5 | 55 | 0 | 34.658303 | 50.209908 | -1.126140 | 15.441237 |
| B1 | 6 | 55 | 0 | 37.855988 | 51.935939 | -2.344322 | 16.260104 |
| B1 | 7 | 55 | 0 | 37.896999 | 52.472261 | -2.773158 | 16.055479 |
| B1 | 8 | 55 | 0 | 43.247314 | 56.575082 | -1.809158 | 17.545141 |
| B1 | 9 | 55 | 0 | 43.693462 | 57.885383 | -1.354613 | 17.216572 |
| B1 | 10 | 55 | 0 | 45.009604 | 59.847492 | -1.790976 | 17.377828 |
| B1 | 11 | 55 | 0 | 48.834266 | 64.609436 | -1.063703 | 18.452920 |
| B1 | 12 | 55 | 0 | 44.780238 | 64.026220 | -1.063703 | 15.676693 |
| B1 | 13 | 55 | 0 | 47.266979 | 66.755863 | -1.063703 | 17.072997 |
| B1 | 14 | 55 | 0 | 47.777277 | 67.670120 | -1.154613 | 16.807907 |
| B1 | 15 | 55 | 0 | 52.531094 | 67.832137 | -1.154613 | 17.531900 |
| B1 | 16 | 55 | 0 | 58.311042 | 77.678180 | -0.972794 | 18.801050 |
| B1 | 17 | 55 | 0 | 51.080718 | 65.086418 | -0.972794 | 16.210008 |
| B1 | 18 | 55 | 0 | 45.883252 | 63.746509 | -0.972794 | 14.309712 |
| B1 | 19 | 55 | 0 | 51.895110 | 82.475617 | 5.390842 | 15.213311 |
| B1 | 20 | 55 | 0 | 111.785710 | 221.516197 | 9.429078 | 25.928346 |
| B1 | 21 | 55 | 0 | 85.903944 | 151.696804 | 9.027206 | 23.790869 |
| B1 | 22 | 55 | 0 | 47.279890 | 64.064354 | -1.063703 | 14.617787 |
| B1 | 23 | 55 | 0 | 36.780977 | 52.727142 | -1.063703 | 11.970770 |
| B1 | 24 | 55 | 0 | 42.448653 | 57.935816 | -0.627340 | 15.536634 |
| B7 | 1 | 55 | 0 | 68.035750 | 86.146986 | -10.716883 | 30.523057 |
| B7 | 2 | 55 | 0 | 64.783973 | 84.275938 | -13.618538 | 28.375533 |
| B7 | 3 | 55 | 0 | 67.067992 | 84.495135 | -12.254901 | 30.411696 |
| B7 | 4 | 55 | 0 | 67.456197 | 84.632323 | -10.926356 | 30.959701 |
| B7 | 5 | 55 | 0 | 64.779182 | 82.651472 | -12.282156 | 28.860926 |
| B7 | 6 | 55 | 0 | 64.601903 | 85.463287 | -14.468974 | 27.748151 |
| B7 | 7 | 55 | 0 | 68.192930 | 85.170801 | -16.091992 | 28.890682 |
| B7 | 8 | 55 | 0 | 71.219297 | 85.231734 | -12.637883 | 28.893184 |
| B7 | 9 | 55 | 0 | 65.777309 | 81.904443 | -12.346974 | 25.918289 |
| B7 | 10 | 55 | 0 | 65.160180 | 80.294867 | -14.419701 | 25.157795 |
| B7 | 11 | 55 | 0 | 67.297163 | 83.465314 | -12.388829 | 25.429462 |
| B7 | 12 | 55 | 0 | 63.255449 | 82.137333 | -13.352829 | 22.144507 |
| B7 | 13 | 55 | 0 | 66.414799 | 82.701007 | -14.170665 | 23.989256 |
| B7 | 14 | 55 | 0 | 67.216283 | 85.016543 | -11.770301 | 23.646493 |
| B7 | 15 | 55 | 0 | 63.973106 | 81.307021 | -8.856192 | 21.350595 |
| B7 | 16 | 55 | 0 | 67.895859 | 89.104449 | -7.116119 | 21.891453 |
| B7 | 17 | 55 | 0 | 71.490539 | 86.923915 | -10.370629 | 22.686882 |
| B7 | 18 | 55 | 0 | 75.998587 | 91.955157 | -5.279756 | 23.701848 |
| B7 | 19 | 55 | 0 | 83.583983 | 109.010417 | 4.465735 | 24.503063 |
| B7 | 20 | 55 | 0 | 177.752094 | 268.830370 | 5.449426 | 41.229043 |
| B7 | 21 | 55 | 0 | 113.857929 | 171.501146 | 10.320281 | 31.532651 |
| B7 | 22 | 55 | 0 | 74.141708 | 91.670713 | -3.316083 | 22.922805 |
| B7 | 23 | 55 | 0 | 59.611652 | 74.395173 | -6.588847 | 19.401262 |
| B7 | 24 | 55 | 0 | 73.564485 | 87.747184 | -11.297919 | 26.925342 |

## Métricas por día de semana

Agrupadas por fecha/periodo objetivo. No se usan para reselección retrospectiva. n cuenta observaciones horarias.

### validation

| Baseline | día de semana | Evaluables | Indisponibles | MAE | RMSE | bias | WAPE % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | lunes | 192 | 0 | 73.104192 | 114.593062 | -32.771819 | 17.952870 |
| B1 | martes | 192 | 0 | 51.451238 | 84.969786 | 9.507264 | 12.937416 |
| B1 | miércoles | 192 | 0 | 73.407705 | 126.359291 | 8.651644 | 18.868854 |
| B1 | jueves | 168 | 0 | 46.470919 | 71.678100 | 6.993520 | 12.190351 |
| B1 | viernes | 192 | 0 | 56.791383 | 86.096711 | 0.289876 | 12.288337 |
| B1 | sábado | 192 | 0 | 43.866594 | 66.349413 | 4.019596 | 9.574991 |
| B1 | domingo | 192 | 0 | 93.732004 | 166.850155 | 83.708411 | 25.033334 |
| B7 | lunes | 192 | 0 | 228.579340 | 300.406068 | 81.328627 | 56.134335 |
| B7 | martes | 192 | 0 | 201.437626 | 289.570264 | 85.866761 | 50.651498 |
| B7 | miércoles | 192 | 0 | 198.594167 | 326.988558 | 69.449404 | 51.047016 |
| B7 | jueves | 168 | 0 | 180.820706 | 320.664454 | 99.121799 | 47.433277 |
| B7 | viernes | 192 | 0 | 200.427877 | 313.028677 | 94.994852 | 43.367941 |
| B7 | sábado | 192 | 0 | 255.094321 | 353.221856 | 52.870251 | 55.680773 |
| B7 | domingo | 192 | 0 | 256.536039 | 318.642782 | 49.447029 | 68.513977 |

### test

| Baseline | día de semana | Evaluables | Indisponibles | MAE | RMSE | bias | WAPE % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | lunes | 192 | 0 | 55.918415 | 87.279475 | -39.533751 | 20.564935 |
| B1 | martes | 192 | 0 | 40.556555 | 61.668605 | -25.102088 | 13.654783 |
| B1 | miércoles | 168 | 0 | 49.403751 | 75.530932 | -0.986427 | 17.444040 |
| B1 | jueves | 192 | 0 | 47.077797 | 93.431793 | -18.894148 | 14.894815 |
| B1 | viernes | 192 | 0 | 44.483476 | 73.276305 | 27.492714 | 15.414841 |
| B1 | sábado | 192 | 0 | 48.443743 | 76.969603 | 12.635676 | 17.555900 |
| B1 | domingo | 192 | 0 | 51.321016 | 86.492635 | 43.562254 | 22.085171 |
| B7 | lunes | 192 | 0 | 74.086175 | 106.357453 | -15.015296 | 27.246433 |
| B7 | martes | 192 | 0 | 85.369844 | 120.320749 | -11.785619 | 28.742744 |
| B7 | miércoles | 168 | 0 | 71.183983 | 108.256862 | 3.460732 | 25.134453 |
| B7 | jueves | 192 | 0 | 71.429723 | 104.377664 | -3.652894 | 22.599454 |
| B7 | viernes | 192 | 0 | 75.364332 | 103.338688 | -14.976941 | 26.115971 |
| B7 | sábado | 192 | 0 | 78.469359 | 109.174459 | -13.388053 | 28.437113 |
| B7 | domingo | 192 | 0 | 66.651141 | 78.361651 | -5.522044 | 28.682243 |

## Reproducibilidad

1. Verificar SHA-256 antes de leer valores y comprobar fechas/periodos.
2. Construir diccionario (fecha,periodo) → precio.
3. Recorrer los targets validation en orden fecha/periodo, consultar D−1 y D−7 por separado y acumular errores.
4. Aplicar la regla de selección anterior y congelar el ID.
5. Recorrer test una sola vez por baseline con las mismas definiciones.
6. Agrupar errores por periodo y weekday; aplicar exactamente las mismas fórmulas.

Las referencias faltantes se excluyen de numeradores/denominadores y se contabilizan, nunca se rellenan. El JSON contiene particiones, definiciones, fórmulas, tolerancia, versión de Python, disponibilidad, componentes WAPE y desgloses suficientes para reproducir el cálculo desde el CSV.

## Exposición previa y limitaciones

2024-07-01..2024-07-30 fue inspeccionado descriptivamente durante la exploración del corpus. No se evaluó predictor entonces. Test no se describe como completamente unseen; esa exposición no modificó reglas ni selección.

Un año y estas particiones no demuestran generalización fuera del periodo ni estacionalidad anual repetible. La disponibilidad completa del día anterior es un supuesto del experimento, no una garantía sobre publicación XM en tiempo real. No se seleccionaron features ni se ejecutaron Ridge, árboles, boosting, redes o tuning. Este incremento fija referencias experimentales y protocolo; no implementa HU-08.
