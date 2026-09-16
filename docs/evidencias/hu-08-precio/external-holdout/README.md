# Holdout externo B1 PrecBolsNaci — HU-08

## Alcance

Periodo 2024-07-31..2024-09-28, completamente posterior al corpus original 2023-08-01..2024-07-30. Se evalúa exclusivamente B1 ya seleccionado. No se reconsidera Ridge, no se ajustan parámetros ni se prueban otros modelos. Unidad COP/kWh; fecha calendario y periodo 1..24 sin timestamps/timezone inferidos.

## Adquisición real

| Rango | EnergyDataset | PreparedDataset | HTTP import/validate/prepare | Registros | Primer precio P1 | Último precio P24 |
| --- | --- | --- | --- | --- | --- | --- |
| 2024-07-31..2024-08-29 | 67 | 48 | 201/200/200 | 720 | 404.79085 | 519.95226 |
| 2024-08-30..2024-09-28 | 68 | 49 | 201/200/200 | 720 | 444.51898 | 934.62274 |

Express, XM/SINERGOX y PostgreSQL reales. Dos bloques de 30 días inclusivos, sin solapamientos. Un intento por bloque: cero fallos/reintentos. HU-02 aprobado, 0 errores y 0 advertencias, xm_preciobolsnaci_base@1.0.0; HU-03 xm_preciobolsnaci_preparacion_base@1.0.0, reused=false. Comparadas respuesta normalizada XM, contenido HU-01 y preparado SQL/HTTP, conservando precios e índices. Sin features ni transformaciones del precio.

Conteos PostgreSQL EnergyDataset 37→39; PreparedDataset 37→39. Todas las filas anteriores comparadas e intactas. Nuevos datasets/preparados conservados.

## Integridad y snapshot

Verificados 60 días, 1440 observaciones, periodos exactos 1..24 por día, cero duplicados, conflictos, huecos y valores no finitos. Consolidación exclusiva de PreparedDataset 48/49 leído directamente de PostgreSQL. CSV ordenado por fecha/periodo, columnas fecha_xm,periodo,precio_cop_kwh; sin IDs ni derivados. UTF-8 sin BOM, LF, salto final.

Snapshot: preciobolsnaci-2024-07-31_2024-09-28.csv. Tamaño 33860 bytes. SHA-256: `80f0732509f547e1a7766cd211c728aa7b636017ec0b0d8a5b34123e02910c6a`. Hash comprobado antes de evaluar. manifest.json conserva procedencia e integridad.

## Protocolo B1 y criterio previo

prediction(D,p)=price(D−1,p), lookup por clave fecha/periodo, nunca desplazamiento posicional. Para 2024-07-31 se usan exclusivamente los 24 precios de 2024-07-30 del corpus original, cuyo SHA-256 fue verificado. No se usan targets del corpus anterior. Para días siguientes se incorpora D−1 real cronológicamente; el día objetivo se añade a historia solo tras generar sus 24 predicciones. Sin imputación ni uso de valores del mismo día/futuros. Se supone disponible el día anterior completo.

Regla fijada antes de calcular: 1440 evaluables, 0 indisponibles, 0 fallos/inconsistencias, WAPE finito con denominador positivo y MAE externo ≤1.25×MAE test interno. Valor completo interno=48.14971375757575; límite=60.18714219696969 COP/kWh. No se modifica la regla después del resultado.

## Resultados

| Partición | Evaluables | Indisponibles | MAE | RMSE | bias | WAPE % |
| --- | --- | --- | --- | --- | --- | --- |
| validation | 1320 | 0 | 62.984024742 | 108.186706465 | 11.567171182 | 15.343082232 |
| test | 1320 | 0 | 48.149713758 | 79.924275476 | -0.102176939 | 17.154461715 |
| externalHoldout | 1440 | 0 | 48.510725042 | 84.410189068 | -8.539198556 | 7.137016325 |

Numerador WAPE=69855.44406; denominador=978776.5766. Componentes sumados en COP/kWh, no liquidación monetaria. WAPE es error porcentual, no accuracy.

| Error absoluto | Valor |
| --- | --- |
| Mínimo | 0.000320000 |
| Máximo | 488.393060000 |
| P50 | 26.020320000 |
| P90 | 107.784930000 |
| P95 | 161.026690000 |
| P99 | 419.154830000 |

Decisión literal: **PASA**. Cambio MAE respecto al test interno: 0.7497682871149076%.

Regla candidata de referencia validada temporalmente bajo este criterio; artefacto/contrato productivo pendientes.

### Por periodo

| Periodo | n | MAE | RMSE |
| --- | --- | --- | --- |
| 1 | 60 | 67.564292167 | 112.541245226 |
| 2 | 60 | 57.775210167 | 102.113103308 |
| 3 | 60 | 68.354953167 | 114.748103224 |
| 4 | 60 | 72.243772833 | 120.757401809 |
| 5 | 60 | 62.770097500 | 101.400135326 |
| 6 | 60 | 58.437964500 | 108.245686321 |
| 7 | 60 | 59.643385167 | 106.948383488 |
| 8 | 60 | 63.835593500 | 113.226249061 |
| 9 | 60 | 60.710013500 | 112.278486601 |
| 10 | 60 | 65.958381167 | 116.780990687 |
| 11 | 60 | 58.338242833 | 104.325042550 |
| 12 | 60 | 46.226653833 | 71.466340906 |
| 13 | 60 | 40.940670167 | 59.373170250 |
| 14 | 60 | 36.705049167 | 49.383533862 |
| 15 | 60 | 39.109297833 | 53.008050522 |
| 16 | 60 | 42.113900500 | 57.999429355 |
| 17 | 60 | 39.679407833 | 58.252435955 |
| 18 | 60 | 35.065468833 | 51.746319545 |
| 19 | 60 | 28.384138167 | 43.855681188 |
| 20 | 60 | 35.888483833 | 56.682384653 |
| 21 | 60 | 30.674112167 | 46.246968545 |
| 22 | 60 | 32.842804833 | 49.438917471 |
| 23 | 60 | 30.462093167 | 44.783732900 |
| 24 | 60 | 30.533414167 | 41.637142875 |

### Por día de semana

| Día | n | MAE | RMSE |
| --- | --- | --- | --- |
| lunes | 192 | 89.044640208 | 146.140123478 |
| martes | 192 | 48.984367813 | 82.152849724 |
| miércoles | 216 | 28.394474074 | 45.319722948 |
| jueves | 216 | 35.033062130 | 49.101924008 |
| viernes | 216 | 43.551931944 | 65.898796775 |
| sábado | 216 | 42.731126852 | 65.194741346 |
| domingo | 192 | 57.377010417 | 103.159859164 |

## Método reproducible y límites

Python 3.14.4 estándar, float IEEE-754 y math.fsum, sin redondeo intermedio. Error=predicción−actual; MAE=mean(abs(error)); RMSE=sqrt(mean(error²)); bias=mean(error); WAPE=100*sum(abs(error))/sum(abs(actual)). Percentiles por interpolación lineal en (n−1)p. README redondea presentación a nueve decimales; metrics.json conserva valores completos. Desgloses descriptivos, no usados para seleccionar o recalibrar.

El test interno ya fue evaluado y parte de julio de 2024 había sido inspeccionada descriptivamente. El holdout actual es posterior y no se usa para cambiar B1. Esta evaluación no demuestra generalización universal ni garantiza disponibilidad del precio al origen en tiempo real. No es precio personalizado, recomendación financiera o liquidación comercial. HU-08 no está completa; validación académica/formal pendiente. No hay entrenamiento ni endpoint.

## Verificación final

Desde backend: `bun test`, 404 aprobadas, 0 fallidas, 1217 aserciones. Typecheck `bun --bun run tsc --noEmit --incremental false -p tsconfig.json`, correcto. `git diff --check`, correcto; revisión adicional de espacios finales en los archivos nuevos. Hash, cobertura, disponibilidad y coherencia de desgloses verificados desde los archivos finales. La regla local `.gitattributes` conserva LF para el CSV y evita cambios de hash por conversión CRLF en Windows. No se modificó código funcional ni se hizo commit.
