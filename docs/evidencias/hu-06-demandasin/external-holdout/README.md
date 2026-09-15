# Holdout temporal externo HU-06 - DemaSIN

## Alcance y protocolo

DemaSIN es demanda agregada del SIN; no usuario ni zona. Horizonte D+1, confidence pendiente. Validacion academica/formal pendiente. HU-06 no esta implementada. Un solo holdout no demuestra estabilidad general ni generalizacion anual.
El test original 2024-06-06..2024-07-30 ya habia sido observado. Este rango posterior 2024-07-31..2024-09-28 se usa como nueva evaluacion temporal, sin ajustar especificacion tras sus resultados.

## Adquisicion real

Bloques 2024-07-31..2024-08-29 (EnergyDataset 51 / PreparedDataset 32) y 2024-08-30..2024-09-28 (52 / 33). Cada uno: 30 registros, HTTP import/validate/prepare=201/200/200, aprobado, cero errores/advertencias, canProceed=true, reused=false.
Ruleset xm_demandasin_base@1.0.0; perfil xm_demandasin_preparacion_base@1.0.0. Comparacion calendario exacta: 60 fechas unicas, cero huecos, duplicados, conflictos o valores no finitos. Unidad kWh. Source, contenido HTTP/SQL e indices 0..29 comprobados. Sin hora, zona, timestamps ni features generadas por HU-03. No reintentos. Ambos bloques conservados; filas anteriores intactas.
CSV UTF-8 sin BOM, LF, 2030 bytes: demandasin-2024-07-31_2024-09-28.csv
SHA-256 externo: ddb2b802941ae82230d9fbe0dee1847cdbaa12d986f0af460cf54a6376fd8eaa
SHA-256 corpus original: 73e795ae04e4dd36e1dff7fda38e47627514602565ee086b2710f1c6da6c807f

## Especificacion fijada antes de evaluar

Ridge alpha=100. Features ordenadas: demand_D_minus_1, demand_D_minus_7, demand_D_minus_14, demand_D_minus_28, weekday_sin, weekday_cos. Weekday lunes=0..domingo=6. Sin nuevas features/alpha, festivos, clima ni cambio de horizonte. B1=D-1; B7=D-7, por claves calendario.
Nueva instancia entrenada solo en 2023-08-01..2024-07-30: 337 filas efectivas (2023-08-29..2024-07-30), 28 excluidas sin D-28, sin imputacion. Escalado de las seis features: medias/desviaciones poblacionales ddof=0 del entrenamiento efectivo. Target sin escalar.
Misma matematica: centrar X escalada e y; resolver (Xc^T Xc + 100 I)w=Xc^T yc con eliminacion gaussiana/pivoteo parcial; intercepto=mean(y)-mean(X_scaled) dot w. Python 3.14.4, stdlib y math.fsum. Parametros completos en ridge-model.json.
Inferencia: intercepto + sum(coef[j]*(feature[j]-media[j])/desviacion[j]). Se supone pasado completo disponible al origen; el historial incorpora cada valor del holdout solo despues de predecir ese dia. Todos los accesos de rezagos son estrictamente anteriores al objetivo. Las features de calendario no infieren timestamps.

## Regla predefinida

Todos los criterios: cero indisponibles del modelo; MAE no peor que B7 en mas de 5%; mejora estricta en MAE o RMSE frente B7; WAPE finito con denominador positivo; sin evidencia de leakage/fallo numerico. No se cambia la regla si B1 gana.

## Resultados

| Modelo | Evaluables | Indisponibles | MAE kWh | RMSE kWh | bias kWh | WAPE % |
|---|---:|---:|---:|---:|---:|---:|
| B1 | 60 | 0 | 10134510.983667 | 13606509.531036 | 236455.595667 | 4.451967 |
| B7 | 60 | 0 | 5337033.312167 | 7253962.306664 | -52556.106833 | 2.344494 |
| Ridge | 60 | 0 | 5140961.018888 | 6644945.165230 | -1246487.846406 | 2.258361 |

MAE=mean(abs(prediction-actual)); RMSE=sqrt(mean((prediction-actual)^2)); bias=mean(prediction-actual). WAPE=100*sum(abs(actual-prediction))/sum(abs(actual)); sin redondeo interno.

| Modelo | Numerador WAPE kWh | Denominador WAPE kWh |
|---|---:|---:|
| B1 | 608070659.02 | 13658471799.11 |
| B7 | 320221998.7299999 | 13658471799.11 |
| Ridge | 308457661.13327646 | 13658471799.11 |

relativeMAEvsB7=100*(Ridge_MAE-B7_MAE)/B7_MAE = -3.673806810082002%. Negativo mejora; positivo empeora.

- zeroModelUnavailable: True
- MAENoMoreThan5PercentWorseThanB7: True
- MAEOrRMSEStrictlyBetterThanB7: True
- finiteWAPEAndPositiveDenominator: True
- noLeakageOrNumericalFailure: True

Decision: Ridge seleccionado para implementacion HU-06 segun regla predefinida; artefacto permanece EXPERIMENTAL.

## Diagnostico por dia calendario

No se usa para reseleccionar.

| Modelo | Dia | n | MAE kWh | RMSE kWh |
|---|---|---:|---:|---:|
| B1 | Monday | 8 | 23417201.343750 | 24244367.317754 |
| B1 | Tuesday | 8 | 7343093.380000 | 10370680.467279 |
| B1 | Wednesday | 9 | 4490435.286667 | 6792806.293879 |
| B1 | Thursday | 9 | 4663570.836667 | 7341973.721066 |
| B1 | Friday | 9 | 1606309.436667 | 2177019.069799 |
| B1 | Saturday | 9 | 11579554.402222 | 11946702.916363 |
| B1 | Sunday | 8 | 20116183.946250 | 20365147.785271 |
| B7 | Monday | 8 | 7852397.372500 | 8895637.588989 |
| B7 | Tuesday | 8 | 5370162.753750 | 6026256.319142 |
| B7 | Wednesday | 9 | 8361870.100000 | 12109596.657529 |
| B7 | Thursday | 9 | 4228123.981111 | 4832029.913741 |
| B7 | Friday | 9 | 2717411.505556 | 3345524.608229 |
| B7 | Saturday | 9 | 4200408.281111 | 5213178.425263 |
| B7 | Sunday | 8 | 4858899.113750 | 6692977.715877 |
| Ridge | Monday | 8 | 9026719.894938 | 10012755.528946 |
| Ridge | Tuesday | 8 | 4759545.775912 | 5459112.525478 |
| Ridge | Wednesday | 9 | 5178465.965177 | 8601335.442148 |
| Ridge | Thursday | 9 | 3196448.754600 | 3646799.084916 |
| Ridge | Friday | 9 | 4383162.988348 | 4792436.543266 |
| Ridge | Saturday | 9 | 3051200.865914 | 4028561.592009 |
| Ridge | Sunday | 8 | 6985503.575015 | 7669342.123554 |

## Limitaciones

Sin equivalencia con consumo individual/zonal; fallback zonal y confidence siguen pendientes. No registro productivo, endpoint ni entrenamiento en runtime. Las metricas corresponden solo a este periodo. No se cambiaron corpus original, features, alpha ni protocolo. El artefacto experimental guarda escalado, coeficientes, intercepto, resultados completos y comprobaciones numericas.
