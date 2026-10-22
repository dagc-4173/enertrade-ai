# Adquisición experimental de demanda horaria XM

HU-01/HU-02: captura y control inicial de calidad. HU-03/HU-06/HU-07: dependientes, pendientes para esta serie.

## Definición y alcance

`DemaReal / Sistema`, kWh, resolución horaria. El catálogo XM define demanda de usuarios regulados y no regulados del SIN y excluye alumbrado público. No equivale automáticamente a `DemaSIN` ni a consumo individual. El target experimental se denomina `demanda_real_kwh`.

El incremento reutiliza la normalización del proveedor XM, pero conserva el catálogo productivo de tres métricas. No se añade DemaReal a importación, sync, Prisma, frontend ni modelos activos. No contiene entrenamiento ni inferencia. Esta decisión mantiene el objetivo TG-I de desarrollar/evaluar el motor y delimita un insumo experimental para HU-06.

## Ejecución

Desde backend, con el padre del directorio de salida ya existente:

```powershell
bun scripts/xm-hourly-demand-capture.ts 2025-01-01 2025-01-01 RUTA_A_DIRECTORIO_NUEVO
```

La captura consulta primero `POST https://servapibi.xm.com.co/Lists` con `MetricId=ListadoMetricas`. Exige una entrada DemaReal/Sistema compatible en unidad, resolución, endpoint, rango y exclusión de alumbrado público. Luego consulta `/hourly` con entidad Sistema y filtros vacíos. Máximo 30 días inclusivos, timeout 15 s por consulta y 2 MiB por respuesta, sin reintentos automáticos ni credenciales. Un error no representa ausencia de datos.

Se exigen todos los días del rango, 24 periodos únicos por día, fechas válidas, números finitos y energía no negativa. Cero es válido. No hay imputación, desagregación diaria, redondeo ni timestamp UTC inferido. Un periodo extra también invalida la captura.

Archivos: `raw.json`, `catalog-raw.json`, `normalized.json`, `manifest.json`. Se conservan bytes UTF-8 sin reformatear las respuestas y SHA-256 de los contenidos; normalizado serializado determinísticamente mediante el contrato versionado. Las fechas de adquisición son distintas de las fechas observadas. El manifiesto incluye consulta, definición del catálogo y reporte de calidad. `replayHourlyDemand` verifica hashes y vuelve a normalizar sin red.

El directorio se crea exclusivamente: nunca se reemplaza una captura anterior. El manifiesto se escribe al final. Una carpeta sin manifiesto puede ser una escritura incompleta y no acredita éxito. Los hashes detectan alteraciones, no constituyen firma de autenticidad. El consumidor debe ejecutar replay antes de usar los datos.

## Límites

No se conoce la hora original de publicación ni se reconstruyen revisiones. Una captura actual de datos de 2025 no acredita disponibilidad histórica al origen. No se ha verificado cobertura completa 2023–2025 ni licencia universal de redistribución. Los snapshots son insumos experimentales, no PreparedDataset Prisma ni resultados de pronóstico. Falta verificar semántica de intervalos antes de unir meteorología.

## Pruebas previstas

Ejecutar `bun test src/tests/xm-hourly-demand-acquisition.test.ts` y las regresiones externas/XM. Fixtures sintéticos, transporte sustituido, sin DB; persistencia en directorios temporales. Los IDs DR-01..DR-09 cubren contrato, compatibilidad diaria, entrada inválida, calidad, calendario, catálogo, fallos, integridad y persistencia. Cada caso describe pasos y resultado esperado en la suite; resultados obtenidos se registrarán tras ejecutar.

Fuentes: catálogo público XM y https://github.com/EquipoAnaliticaXM/API_XM/blob/master/pydataxm/pydataxm.py. No se cambia el informe académico ni se marca una HU completa.

Apoyo de IA: Codex apoyó el diseño, implementación y pruebas; el estudiante debe revisar y comprender el código y las evidencias antes de incorporarlos al informe.
