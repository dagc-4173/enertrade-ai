# Corpus histórico PrecBolsNaci para HU-08

## Alcance y procedencia

Corpus adquirido mediante Express real, XM/SINERGOX real y PostgreSQL real. Fuente PrecBolsNaci, unidad COP/kWh, granularidad horaria expresada como fecha calendario y periodo 1..24. No se infiere UTC, hora local ni timestamp. No se modifica el precio ni se agrega a escala diaria.

Este incremento no completa HU-08. No existe aún modelo de precio ni endpoint de estimación. No es liquidación ni recomendación financiera, precio personalizado o negociación comercial real. Validación académica/formal pendiente.

## Adquisición y comprobaciones por bloque

Se verificaron programáticamente los 13 rangos: 365 días consecutivos, sin huecos ni solapamientos y máximo 30 días inclusivos. Para cada bloque se ejecutó POST /external-data/import, POST /datasets/:id/validate y POST /datasets/:id/prepare. Todos tuvieron un único intento: cero fallos y cero reintentos.

| Bloque | Rango | EnergyDataset | PreparedDataset | HTTP import/validate/prepare | Registros | Primer precio (P1) | Último precio (P24) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2023-08-01..2023-08-30 | 54 | 35 | 201/200/200 | 720 | 322.00712 | 747.26538 |
| 2 | 2023-08-31..2023-09-29 | 55 | 36 | 201/200/200 | 720 | 797.55071 | 1018.25479 |
| 3 | 2023-09-30..2023-10-29 | 56 | 37 | 201/200/200 | 720 | 1016.02604 | 292.55684 |
| 4 | 2023-10-30..2023-11-28 | 57 | 38 | 201/200/200 | 720 | 274.12049 | 453.53005 |
| 5 | 2023-11-29..2023-12-28 | 58 | 39 | 201/200/200 | 720 | 452.10547 | 384.80591 |
| 6 | 2023-12-29..2024-01-27 | 59 | 40 | 201/200/200 | 720 | 344.2566 | 450.30074 |
| 7 | 2024-01-28..2024-02-26 | 60 | 41 | 201/200/200 | 720 | 509.54063 | 559.44333 |
| 8 | 2024-02-27..2024-03-27 | 61 | 42 | 201/200/200 | 720 | 547.63553 | 858.74024 |
| 9 | 2024-03-28..2024-04-26 | 62 | 43 | 201/200/200 | 720 | 1004.61181 | 199.1058 |
| 10 | 2024-04-27..2024-05-26 | 63 | 44 | 201/200/200 | 720 | 101.17844 | 587.01462 |
| 11 | 2024-05-27..2024-06-25 | 64 | 45 | 201/200/200 | 720 | 304.21175 | 252.39023 |
| 12 | 2024-06-26..2024-07-25 | 65 | 46 | 201/200/200 | 720 | 204.43352 | 306.76032 |
| 13 | 2024-07-26..2024-07-30 | 66 | 47 | 201/200/200 | 120 | 296.00508 | 398.02391 |

Todos los bloques terminaron aprobado, canProceed=true, errorCount=0, warningCount=0, issues=[], ruleset xm_preciobolsnaci_base@1.0.0. Primera preparación reused=false, perfil xm_preciobolsnaci_preparacion_base@1.0.0. Las fechas del primer/último registro son los límites del rango, periodos 1/24. El manifest conserva respuestas resumidas, informe, IDs, source, primer/último registro e índices observados por bloque.

La respuesta XM normalizada se comparó con el registro HU-01. Se verificó contenido original intacto después de validar/preparar, informe y validatedAt persistidos, correspondencia HTTP/SQL y sourceRecordIndex continuo según cada entrada. Preparación sin features, imputación, agregación, redondeo, zona o timestamps.

Idempotencia secuencial ejecutada en bloques 1, 7 y 13: HTTP 200, mismos PreparedDataset 35, 41 y 47 respectivamente, reused=true, mismo preparedAt y una fila por clave compuesta. No se ejecutó concurrencia real.

Conteos PostgreSQL: EnergyDataset 24 → 37; PreparedDataset 24 → 37. Las filas previas se compararon completas y permanecieron intactas. EnergyDataset 53 / PreparedDataset 34 quedan conservados como evidencia anterior y excluidos del corpus. Los nuevos datasets/preparados se conservan.

## Integridad y snapshot

Consolidación mediante lectura directa de los PreparedDataset 35–47 únicamente. Comprobadas 8.760 observaciones, 365 fechas, 24 registros y periodos exactos 1..24 por fecha, cero fechas faltantes, cero claves duplicadas, cero conflictos y cero valores no finitos. Orden fecha_xm ascendente y periodo numérico ascendente. Unidad COP/kWh comprobada en cada preparado y source.

Archivo: preciobolsnaci-2023-08-01_2024-07-30.csv. Columnas exactas: fecha_xm,periodo,precio_cop_kwh. Sin IDs, índices internos o variables derivadas. UTF-8 sin BOM, separador coma, punto decimal, LF y salto final. Tamaño: 207615 bytes.

SHA-256 de los bytes finales: 07fdc38fa15929ff2bf8a6aefe0a3f2aa292276c5f18c8dbb0919be8537e0506. El CSV se volvió a leer y contrastar con las filas SQL. La procedencia se conserva en manifest.json, separada del CSV.

La regla local `.gitattributes` fija `text eol=lf` exclusivamente para este CSV. Evita que `core.autocrlf=true` cambie sus bytes en un checkout de Windows. No se modificó la configuración global de Git ni otros snapshots.

## Caracterización descriptiva

Sin eliminación de outliers, winsorización, imputación o transformación. Cálculos en doble precisión con suma compensada; sin redondeo intermedio. La presentación siguiente redondea a cinco decimales; manifest.json conserva los valores calculados. Desviación muestral con n−1. Percentiles mediante interpolación lineal en (n−1)p sobre valores ordenados. Los desgloses no son features del pipeline.

| Estadístico | Valor |
| --- | --- |
| n | 8760 |
| min | 95.85161 |
| max | 1595.68608 |
| mean | 589.90186 |
| median | 557.08669 |
| sampleStandardDeviation | 309.22681 |
| IQR | 477.12277 |
| P1 | 103.02383 |
| P5 | 133.55563 |
| P25 | 329.00716 |
| P50 | 557.08669 |
| P75 | 806.12993 |
| P95 | 1062.23606 |
| P99 | 1285.58946 |
| zeroCount | 0 |
| negativeCount | 0 |

### Por periodo

| periodo | n | Media | Mediana | Desv. muestral | Mínimo | Máximo |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 365 | 533.58424 | 501.60752 | 328.60698 | 96.36406 | 1497.24108 |
| 2 | 365 | 526.94567 | 501.32247 | 318.54061 | 97.39022 | 1284.63441 |
| 3 | 365 | 517.08474 | 492.55717 | 312.40402 | 97.39022 | 1284.63441 |
| 4 | 365 | 504.43832 | 480.24000 | 309.75326 | 97.34622 | 1284.63441 |
| 5 | 365 | 517.18413 | 483.98271 | 311.50426 | 97.39022 | 1497.24108 |
| 6 | 365 | 538.31172 | 506.11729 | 308.49099 | 97.39022 | 1497.24108 |
| 7 | 365 | 535.35766 | 504.10987 | 307.57764 | 97.39022 | 1497.24108 |
| 8 | 365 | 550.32202 | 512.50098 | 303.40237 | 95.85161 | 1497.24108 |
| 9 | 365 | 567.30960 | 529.70139 | 306.40309 | 95.85161 | 1505.76534 |
| 10 | 365 | 573.05220 | 532.16930 | 309.03745 | 95.85161 | 1526.32034 |
| 11 | 365 | 589.05531 | 557.17116 | 308.94231 | 95.85161 | 1526.32034 |
| 12 | 365 | 604.92024 | 568.98722 | 306.08488 | 104.04720 | 1534.68608 |
| 13 | 365 | 603.71619 | 570.00601 | 307.15104 | 105.00905 | 1534.68608 |
| 14 | 365 | 609.72322 | 584.25360 | 307.19870 | 100.19454 | 1534.68608 |
| 15 | 365 | 622.46892 | 599.11622 | 304.52994 | 100.19454 | 1534.68608 |
| 16 | 365 | 631.98562 | 601.00513 | 299.66168 | 100.19454 | 1565.58806 |
| 17 | 365 | 633.46480 | 600.94333 | 299.27425 | 105.97005 | 1534.68608 |
| 18 | 365 | 636.16989 | 605.44408 | 298.75353 | 105.97105 | 1534.68608 |
| 19 | 365 | 676.73257 | 638.23229 | 295.68350 | 114.04720 | 1595.68608 |
| 20 | 365 | 699.79542 | 674.03097 | 282.62369 | 114.04720 | 1581.22458 |
| 21 | 365 | 670.98131 | 632.19812 | 286.78069 | 114.04720 | 1534.68608 |
| 22 | 365 | 637.69498 | 599.47076 | 293.62087 | 113.01944 | 1526.32034 |
| 23 | 365 | 600.93461 | 558.10151 | 302.62473 | 103.29710 | 1497.24108 |
| 24 | 365 | 576.41129 | 535.53106 | 305.76523 | 103.29710 | 1497.24108 |

### Por día de semana

Día derivado exclusivamente del calendario. n cuenta observaciones horarias, no días. No se atribuye timezone a los periodos XM.

| Día | n | Media | Mediana | Desv. muestral |
| --- | --- | --- | --- | --- |
| lunes | 1248 | 581.65622 | 556.35126 | 313.55115 |
| martes | 1272 | 609.11294 | 593.12981 | 318.26828 |
| miércoles | 1248 | 605.33318 | 577.78995 | 309.99840 |
| jueves | 1248 | 603.45381 | 558.10151 | 301.29374 |
| viernes | 1248 | 601.34938 | 552.19812 | 302.10600 |
| sábado | 1248 | 586.52535 | 548.16925 | 309.59114 |
| domingo | 1248 | 541.51269 | 524.73121 | 304.54259 |

### Mensual

| month | n | Media | Mediana | Desv. muestral | Mínimo | Máximo |
| --- | --- | --- | --- | --- | --- | --- |
| 2023-08 | 744 | 529.82446 | 556.35126 | 221.75274 | 100.58610 | 833.12719 |
| 2023-09 | 720 | 1014.98610 | 1056.98325 | 74.51585 | 639.08013 | 1063.19379 |
| 2023-10 | 744 | 1015.43987 | 1062.19806 | 290.84760 | 105.41225 | 1595.68608 |
| 2023-11 | 720 | 504.54991 | 532.10547 | 233.05503 | 100.78560 | 1068.93066 |
| 2023-12 | 744 | 656.19126 | 751.87591 | 231.95772 | 99.41605 | 973.05084 |
| 2024-01 | 744 | 558.72220 | 569.15334 | 103.55920 | 95.85161 | 721.15667 |
| 2024-02 | 696 | 568.70609 | 563.00367 | 84.57046 | 99.80455 | 712.65071 |
| 2024-03 | 744 | 622.77357 | 574.80601 | 126.26729 | 225.88720 | 1015.73481 |
| 2024-04 | 720 | 748.65676 | 970.13274 | 380.51566 | 96.36406 | 1267.59336 |
| 2024-05 | 744 | 291.54985 | 287.01462 | 119.33262 | 97.34622 | 694.71839 |
| 2024-06 | 720 | 280.69736 | 266.13088 | 98.42922 | 106.93005 | 945.62322 |
| 2024-07 | 720 | 281.51538 | 292.49497 | 112.80434 | 104.51862 | 910.02057 |

Julio de 2024 incluye únicamente los días 1..30, según el rango solicitado.

## Particiones fijadas tras comprobar integridad

| Partición | Inicio | Fin | Días | Observaciones |
| --- | --- | --- | --- | --- |
| train | 2023-08-01 | 2024-04-11 | 255 | 6120 |
| validation | 2024-04-12 | 2024-06-05 | 55 | 1320 |
| test | 2024-06-06 | 2024-07-30 | 55 | 1320 |

Conteos contrastados desde el CSV final. El periodo 2024-07-01..2024-07-30 del test fue inspeccionado descriptivamente durante la exploración previa. No se evaluó predictor alguno entonces. No se denomina completamente unseen; se mantiene como partición temporal de prueba con esta limitación explícita. La caracterización actual describe también el corpus completo, sin seleccionar modelos.

## Relación con HU-04/HU-06 y límites

HU-04 dispone de Gene horario: corpus de entrenamiento 2024-01-01..2024-03-30 y holdout 2024-03-31..2024-04-29. Su corpus/modelo no cubre todo este rango de precio. Una combinación futura requiere protocolo temporal explícito y comprobar disponibilidad de cada variable al origen.

HU-06 dispone de DemaSIN diario. No se reparte entre horas. Cualquier uso como contexto diario requiere una decisión posterior. No se construyó dataset combinado.

Se describe una realización histórica, no estacionalidad anual repetible ni generalización. Deben definirse origen/horizonte y disponibilidad histórica antes de modelar. No se ejecutaron baselines, Ridge, Random Forest, XGBoost, selección de features, tuning ni endpoint HU-08.

## Evidencia y verificación

Los registros HTTP y controles SQL de esta ejecución se resumen en acquisition dentro de manifest.json. No se afirman capturas o archivos de logs no conservados. Snapshot derivado de preparados persistidos; el hash identifica bytes, no autenticidad criptográfica del proveedor.

Desde backend: bun test — 404 aprobadas, 0 fallidas, 1217 aserciones (8 archivos). Typecheck: bun --bun run tsc --noEmit --incremental false -p tsconfig.json — correcto. Verificación independiente con Python estándar desde el CSV: SHA-256, 365 fechas, 8760 filas, periodos, particiones y estadísticos globales/por periodo/weekday/mes correctos. Tolerancia estadística absoluta 1e-10 (percentiles 1e-9), sin modificar datos. git diff --check: correcto. Archivos nuevos revisados además para detectar espacios finales.
