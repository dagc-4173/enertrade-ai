# Ridge experimental HU-06 - DemaSIN

Demanda agregada del SIN; no usuario ni zona. Horizonte D+1. HU-06 no esta implementada. Artefacto experimental, no productivo. Confidence sigue sin definir; validacion academica/formal pendiente.

## Datos y protocolo

Snapshot: ../demandasin-2023-08-01_2024-07-30.csv
SHA-256: 73e795ae04e4dd36e1dff7fda38e47627514602565ee086b2710f1c6da6c807f

Verificados hash, 365 fechas unicas consecutivas, cobertura y valores finitos. No se consulto XM/PostgreSQL ni se modifico backend.
TRAIN: 2023-08-01..2024-04-11 (255). VALIDATION: 2024-04-12..2024-06-05 (55). TEST: 2024-06-06..2024-07-30 (55). Particiones sin cambios.
TRAIN efectivo: 227 objetivos, 2023-08-29..2024-04-11. Se excluyen 28 fechas sin D-28, sin imputacion.

Features ordenadas: demanda_kwh_D_minus_1, demanda_kwh_D_minus_7, demanda_kwh_D_minus_14, demanda_kwh_D_minus_28, sin_2pi_weekday_over_7, cos_2pi_weekday_over_7.
weekday: lunes=0..domingo=6, derivado solo de fecha calendario. Rezagos buscados por claves D-1/D-7/D-14/D-28; todos estrictamente anteriores a D. Sin observacion objetivo/futura, festivos, usuario/zona ni timestamps inferidos. El dia objetivo se usa solo como etiqueta calendario y target, nunca como valor de feature.
Protocolo diario movil: se supone disponible el pasado completo, incluso dias previos ya transcurridos dentro de validation/test.

## Implementacion reproducible

Python 3.14.4, solo stdlib. Escalado de las seis features con media y desviacion poblacional (ddof=0) ajustadas solo sobre TRAIN efectivo. Target sin escalar. Parametros congelados al evaluar validation/test.
Objetivo: SSE + alpha * sum(coef^2), intercepto sin penalizacion. Se centran X escalada e y, se resuelve (Xc^T Xc + alpha I)w=Xc^T yc con eliminacion gaussiana y pivoteo parcial; intercepto=mean(y)-mean(X_scaled) dot w. Sumas con math.fsum. Inferencia: intercept + sum(coefficient[j]*(feature[j]-mean[j])/std[j]).
model.json conserva todos los parametros, orden, convencion weekday y rangos para reproducir inferencia. metrics.json conserva runtime y residuos numericos del sistema lineal. No se redondea durante calculos.

## Validation y seleccion

Alpha predefinidos: 0.01, 0.1, 1, 10, 100. Orden de seleccion: menor MAE validation, menor RMSE, menor alpha.

| Alpha | n | Indisponibles | MAE kWh | RMSE kWh | bias kWh | WAPE % |
|---|---:|---:|---:|---:|---:|---:|
| 0.01 | 55 | 0 | 5161092.453228 | 6958294.404541 | 1176334.876415 | 2.308482 |
| 0.1 | 55 | 0 | 5159473.755094 | 6956950.299389 | 1176047.655321 | 2.307758 |
| 1 | 55 | 0 | 5143487.179093 | 6943917.068879 | 1173238.524448 | 2.300608 |
| 10 | 55 | 0 | 5004569.833965 | 6846527.367027 | 1150496.853736 | 2.238472 |
| 100 | 55 | 0 | 4794437.658802 | 6790783.804423 | 1106996.466856 | 2.144483 |

Alpha seleccionado: 100. Seleccion y criterio congelados antes de calcular test.
Criterio predefinido: mejora MAE validation frente B7 >=5%. improvementPercent=100*(B7_MAE-Ridge_MAE)/B7_MAE = 21.556173794700438%. Resultado: cumple, candidato experimental.

## Test final y comparacion documental

Se evaluo exactamente una vez el Ridge seleccionado en test, sin reajuste ni reseleccion. Test ya habia sido observado en el experimento previo de baselines; no es holdout externo nuevo.

| Particion/modelo | MAE kWh | RMSE kWh | bias kWh | WAPE % |
|---|---:|---:|---:|---:|
| validation B7 | 6111937.536364 | 8321703.306051 | 1342307.514182 | 2.733782 |
| validation Ridge | 4794437.658802 | 6790783.804423 | 1106996.466856 | 2.144483 |
| test B7 | 4579906.609273 | 7193260.237816 | -1006303.092545 | 2.070355 |
| test Ridge | 4859706.401923 | 6680491.331833 | 411162.109242 | 2.196839 |

## WAPE y formulas

MAE=sum(abs(prediction-actual))/n; RMSE=sqrt(sum((prediction-actual)^2)/n); bias=sum(prediction-actual)/n. WAPE=100*sum(abs(actual-prediction))/sum(abs(actual)); denominadores positivos y valores finitos verificados. Numeradores y denominadores completos para cada alpha y test en metrics.json. WAPE no sustituye MAE/RMSE.

## Diagnostico por dia de semana

Solo descriptivo, no usado para reseleccion.

| Particion | Dia | n | MAE kWh | RMSE kWh |
|---|---|---:|---:|---:|
| validation | Monday | 8 | 9685235.619578 | 11150549.488462 |
| validation | Tuesday | 8 | 2730298.324004 | 3446737.654028 |
| validation | Wednesday | 8 | 4530048.373850 | 8056645.877287 |
| validation | Thursday | 7 | 2545529.903275 | 3123477.409663 |
| validation | Friday | 8 | 3326843.274167 | 4639933.867981 |
| validation | Saturday | 8 | 2646499.782510 | 2899503.759136 |
| validation | Sunday | 8 | 7815494.864787 | 8800106.075252 |
| test | Monday | 8 | 12158441.687109 | 12757857.381807 |
| test | Tuesday | 8 | 1950503.896072 | 2274283.647069 |
| test | Wednesday | 7 | 2705817.247809 | 3213986.008816 |
| test | Thursday | 8 | 2280222.396494 | 2651250.173031 |
| test | Friday | 8 | 2576619.398119 | 3551001.714040 |
| test | Saturday | 8 | 4354845.542076 | 5675214.647091 |
| test | Sunday | 8 | 7722258.501517 | 8831961.540693 |

## Limitaciones

Un solo anio no demuestra estacionalidad anual repetible. No se afirma generalizacion fuera del periodo. No se usaron clima, precios ni festivos. No se define confidence. Ninguna prediccion equivale a consumo individual/zonal. No endpoint, entrenamiento en runtime ni registro productivo de modelo.
La seleccion de alpha usa solo validation, pero el test ya observado limita la independencia de conclusiones posteriores. Para promover un modelo seria necesario un protocolo adicional previamente fijado, sin adaptar retrospectivamente las decisiones a este test.
