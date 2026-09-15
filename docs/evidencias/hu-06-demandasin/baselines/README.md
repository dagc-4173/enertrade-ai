# Baselines diarios HU-06 - DemaSIN

Propósito: evaluar referencias reproducibles sobre demanda agregada del SIN en kWh. No representa consumo individual ni zonal. HU-06 todavía sin modelo entrenable; estos baselines no son IA ni implementan HU-06.

## Snapshot y controles

docs/evidencias/hu-06-demandasin/demandasin-2023-08-01_2024-07-30.csv

SHA-256: 73e795ae04e4dd36e1dff7fda38e47627514602565ee086b2710f1c6da6c807f

Verificados antes del cálculo: 365 filas, 365 fechas únicas, rango 2023-08-01..2024-07-30 completo, cero huecos y valores finitos. Sin consultar XM/PostgreSQL ni modificar el corpus.

## Protocolo y particiones

Pronóstico D+1: para fecha objetivo D, usar exclusivamente fechas anteriores. B1=demanda(D-1); B7=demanda(D-7), por claves calendario, nunca por posición de filas. Se permite pasado anterior al inicio de cada partición y observaciones de días anteriores ya transcurridos dentro de ella. Se supone disponibilidad completa de D-1 al origen. No se usan valores del día objetivo, datos futuros, imputación, suavizado ni features entrenadas. La aritmética calendario no atribuye timestamps/timezone a las observaciones.

- Train: 2023-08-01..2024-04-11, 255 días (no se ajusta ningún parámetro).
- Validation: 2024-04-12..2024-06-05, 55 días.
- Test: 2024-06-06..2024-07-30, 55 días.

## Métricas y selección

MAE=sum(abs(prediction-actual))/n; RMSE=sqrt(sum((prediction-actual)^2)/n); bias=sum(prediction-actual)/n. WAPE=100*sum(abs(actual-prediction))/sum(abs(actual)); denominadores comprobados positivos. Cálculos sin redondeo; presentación a seis decimales. Valores completos en metrics.json.

### Validation

| Baseline | Evaluables | Indisponibles | MAE kWh | RMSE kWh | bias kWh | WAPE % |
|---|---:|---:|---:|---:|---:|---:|
| B1 | 55 | 0 | 9782197.353636 | 13194617.180725 | 275384.019818 | 4.375436 |
| B7 | 55 | 0 | 6111937.536364 | 8321703.306051 | 1342307.514182 | 2.733782 |

Selección congelada antes de calcular test: **B7**, por menor MAE validation; desempates predefinidos RMSE y luego ID estable.

### Test

| Baseline | Evaluables | Indisponibles | MAE kWh | RMSE kWh | bias kWh | WAPE % |
|---|---:|---:|---:|---:|---:|---:|
| B1 | 55 | 0 | 9123353.804545 | 13007335.730045 | -173782.235091 | 4.124229 |
| B7 | 55 | 0 | 4579906.609273 | 7193260.237816 | -1006303.092545 | 2.070355 |

Evaluación final seleccionada: B7. Cada baseline se evaluó una sola vez en test. El otro se incluye solo para documentación y no cambia la selección.

### Componentes WAPE

| Partición | Baseline | Numerador kWh | Denominador kWh |
|---|---|---:|---:|
| validation | B1 | 538020854.4499998 | 12296393607.080002 |
| validation | B7 | 336156564.5 | 12296393607.080002 |
| test | B1 | 501784459.2500001 | 12166744902.799997 |
| test | B7 | 251894863.50999993 | 12166744902.799997 |

## Errores por día de semana

No se utilizan para reselección retrospectiva.

| Partición | Baseline | Día | n | MAE kWh | RMSE kWh |
|---|---|---|---:|---:|---:|
| validation | B1 | domingo | 8 | 19122557.081250 | 19290323.696551 |
| validation | B1 | lunes | 8 | 20049250.216250 | 22392646.514554 |
| validation | B1 | martes | 8 | 8850371.405000 | 11466577.627400 |
| validation | B1 | miércoles | 8 | 3797734.810000 | 6606132.250535 |
| validation | B1 | jueves | 7 | 4365096.520000 | 6949935.929762 |
| validation | B1 | viernes | 8 | 2206235.380000 | 3351168.336598 |
| validation | B1 | sábado | 8 | 9406998.458750 | 9734392.019702 |
| validation | B7 | domingo | 8 | 4494630.530000 | 5380313.215728 |
| validation | B7 | lunes | 8 | 12586037.415000 | 15248397.896353 |
| validation | B7 | martes | 8 | 4873232.567500 | 6200196.865055 |
| validation | B7 | miércoles | 8 | 7343664.873750 | 10184438.725724 |
| validation | B7 | jueves | 7 | 4038839.064286 | 4380124.824713 |
| validation | B7 | viernes | 8 | 5052591.353750 | 5903522.654770 |
| validation | B7 | sábado | 8 | 4135429.641250 | 4564356.427762 |
| test | B1 | domingo | 8 | 16614511.852500 | 17234729.521239 |
| test | B1 | lunes | 8 | 21654812.460000 | 24148987.774673 |
| test | B1 | martes | 8 | 7634825.071250 | 11231960.302068 |
| test | B1 | miércoles | 7 | 2481808.858571 | 2835913.809302 |
| test | B1 | jueves | 8 | 1309835.882500 | 1594848.017859 |
| test | B1 | viernes | 8 | 2272209.260000 | 3166540.328418 |
| test | B1 | sábado | 8 | 11065280.128750 | 11713776.640224 |
| test | B7 | domingo | 8 | 3854199.960000 | 4798709.007731 |
| test | B7 | lunes | 8 | 10476734.587500 | 14870874.619733 |
| test | B7 | martes | 8 | 3127929.295000 | 3766227.224051 |
| test | B7 | miércoles | 7 | 1933236.318571 | 2482260.599605 |
| test | B7 | jueves | 8 | 2403426.986250 | 2966968.087924 |
| test | B7 | viernes | 8 | 3427172.451250 | 4670009.987470 |
| test | B7 | sábado | 8 | 6505812.880000 | 7834205.757124 |

## Limitaciones y reproducción

Resultados descriptivos del error en particiones fijas: no demuestran generalización fuera del periodo, ni confianza predictiva ni equivalencia con demanda de usuario/zona. WAPE no sustituye MAE/RMSE. Un año no acredita estacionalidad anual repetible. Validación académica/formal pendiente. La caracterización previa del corpus incluyó test; aquí no se usa para seleccionar baselines.

Para reproducir: verificar hash y calendario; construir diccionario fecha -> demanda; formar pares D/D-lag en validation; calcular las fórmulas y congelar selección con el orden indicado; evaluar luego test y agrupar sus errores por día calendario. No ajustar parámetros ni cambiar particiones. Numeradores, denominadores y resultados completos quedan en metrics.json.
