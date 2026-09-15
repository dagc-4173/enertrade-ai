# Corpus piloto HU-06 — XM DemaSIN

## Alcance

Demanda agregada diaria del SIN en kWh. No corresponde a usuario individual ni zona. El fallback zonal de HU-06 y confidence siguen pendientes. Horizonte futuro previsto: D+1. Todavía no existe modelo HU-06; no se entrenó ni implementó forecast.

Un solo año no demuestra estacionalidad anual repetible. Validación académica/formal pendiente.

## Adquisición real y procedencia

El bloque 1, EnergyDataset 38 / PreparedDataset 19, se verificó mediante lectura PostgreSQL y no se reimportó. Sus HTTP 201/200/200 pertenecen a la integración anterior. En esta ejecución se adquirieron una sola vez los bloques 2–13 mediante Express real y XM real: POST /external-data/import, POST /datasets/:id/validate y POST /datasets/:id/prepare. No hubo timeout ni reintentos.

| Bloque | Rango y primera/última fecha | EnergyDataset | PreparedDataset | Registros |
|---|---|---:|---:|---:|
| 1 | 2023-08-01..2023-08-30 | 38 | 19 | 30 |
| 2 | 2023-08-31..2023-09-29 | 39 | 20 | 30 |
| 3 | 2023-09-30..2023-10-29 | 40 | 21 | 30 |
| 4 | 2023-10-30..2023-11-28 | 41 | 22 | 30 |
| 5 | 2023-11-29..2023-12-28 | 42 | 23 | 30 |
| 6 | 2023-12-29..2024-01-27 | 43 | 24 | 30 |
| 7 | 2024-01-28..2024-02-26 | 44 | 25 | 30 |
| 8 | 2024-02-27..2024-03-27 | 45 | 26 | 30 |
| 9 | 2024-03-28..2024-04-26 | 46 | 27 | 30 |
| 10 | 2024-04-27..2024-05-26 | 47 | 28 | 30 |
| 11 | 2024-05-27..2024-06-25 | 48 | 29 | 30 |
| 12 | 2024-06-26..2024-07-25 | 49 | 30 | 30 |
| 13 | 2024-07-26..2024-07-30 | 50 | 31 | 5 |

Todos los bloques nuevos devolvieron HTTP 201/200/200, status=aprobado, errorCount=0, warningCount=0, canProceed=true y reused=false. Ruleset: xm_demandasin_base@1.0.0. Perfil: xm_demandasin_preparacion_base@1.0.0. El informe del bloque reutilizado también se comprobó. El manifiesto conserva los resultados por bloque.

PostgreSQL confirmó source determinista, contenido original intacto, informe persistido y correspondencia con HTTP. Los registros importados nuevos se compararon con la respuesta normalizada real de XM. Los preparados conservan fecha_xm y demanda_kwh, añadiendo únicamente sourceRecordIndex 0..n-1 según entrada. Unidad kWh; temporalIdentity calendar-date; generatedFeatures=[]. Sin hora, zona, timestamps, imputación, agregación ni redondeo.

Los 13 pares quedan conservados en PostgreSQL. Las filas preexistentes permanecieron idénticas; 37/18 no se tocaron ni forman parte del corpus. No se guardaron capturas ni HAR.

## Control global y caracterización

365 registros y 365 fechas únicas, desde 2023-08-01 hasta 2024-07-30. Cero fechas ausentes, duplicados idénticos, conflictos o valores no finitos. Cada bloque y el conjunto se contrastaron contra calendario, sin asumir completitud por HTTP exitoso.

Estadísticas descriptivas completas en manifest.json: globales, por día de semana, correlaciones y deltas diarios. No son desempeño predictivo. Presentación global en kWh:

- Media: 224201446.59.
- Mediana: 228134535.04.
- Desviación estándar muestral: 12883919.75.
- Mínimo: 176268815.03.
- Máximo: 244045937.88.

Los cálculos no redondean internamente. Media = suma(x)/n; desviación muestral = sqrt(suma((x-media)^2)/(n-1)); mediana = valor central o promedio de los dos centrales.

Pearson se calcula buscando D-1, D-7, D-14 y D-28 por clave calendario, nunca desplazando filas. Fórmula: suma((x-mediaX)*(y-mediaY))/sqrt(suma((x-mediaX)^2)*suma((y-mediaY)^2)). Ambas varianzas fueron positivas y se registran en el manifiesto. Delta(D)=demanda(D)-demanda(D-1), diferencia con signo, no magnitud absoluta.

El día de semana y los lags se derivan exclusivamente de fecha calendario. UTC se usa como mecanismo de aritmética de fechas, sin atribuir timezone a las observaciones ni generar timestamps.

## Particiones fijas

| Partición | Rango | Días |
|---|---|---:|
| Train | 2023-08-01..2024-04-11 | 255 |
| Validation | 2024-04-12..2024-06-05 | 55 |
| Test | 2024-06-06..2024-07-30 | 55 |

Verificadas programáticamente: 255+55+55=365, sin huecos ni solapamientos. No cambiarlas por resultados futuros. La caracterización global incluye todas las particiones y no autoriza seleccionar modelos usando test.

## Snapshot

Archivo: demandasin-2023-08-01_2024-07-30.csv. UTF-8 sin BOM, LF y salto final; 11965 bytes. Columnas exactas: fecha_xm,demanda_kwh,prepared_dataset_id,source_dataset_id,source_record_index. Orden fecha_xm ascendente y valores sin redondeo, con procedencia por fila.

SHA-256 de los bytes finales:

`73e795ae04e4dd36e1dff7fda38e47627514602565ee086b2710f1c6da6c807f`

Para reproducir la caracterización: verificar el hash, leer el CSV, agrupar por día calendario y buscar pares mediante claves de fecha. No es necesario volver a consultar XM. Manifest.json registra parámetros, resultados completos, controles, IDs y retainedInPostgreSQL=true.

## Verificación técnica

- Tests DemaSIN aislados: 25 aprobados, 0 fallidos, 41 aserciones.
- Backend completo: 284 aprobados, 0 fallidos, 996 aserciones.
- Typecheck backend correcto.

No se modificó código funcional ni se hizo commit.
