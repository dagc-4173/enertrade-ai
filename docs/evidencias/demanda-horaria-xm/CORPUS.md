# Corpus horario experimental DemaReal 2023–2025

## Propósito y trazabilidad

Este incremento prepara el target horario para la evaluación posterior de persistencia estacional, baseline supervisado, Chronos-Bolt y Chronos-2. Conserva el alcance TG-I de implementar y evaluar el motor y aporta evidencia parcial a HU-01, HU-02 y HU-03. No completa HU-06/HU-07 ni demuestra calidad predictiva.

Fuente: XM, métrica DemaReal, entidad Sistema, kWh. El catálogo consultado excluye alumbrado público. No se considera equivalente a DemaSIN ni a demanda individual. Se preserva fecha calendario y periodo XM 1..24; no se infieren timestamps ni se alinea meteorología.

## Protocolo y ejecución

`xm-demareal-hourly-2023-2025@1.0.0` se guarda en `plan.json` antes de descargar. Rango fijo 2023-01-01..2025-12-31: 37 ventanas contiguas de máximo 30 días. Las consultas se realizan secuencialmente; pausa de 750 ms tras cada ventana nueva; sin reintentos automáticos. Cada ventana conserva respuesta original, catálogo, normalizado, hashes y manifiesto.

Desde backend:

```powershell
bun scripts/xm-hourly-demand-corpus.ts --capture ../docs/evidencias/demanda-horaria-xm/corpus-2023-2025
bun scripts/xm-hourly-demand-corpus.ts --verify ../docs/evidencias/demanda-horaria-xm/corpus-2023-2025
```

`--capture` puede reanudarse: relee y valida las ventanas completas antes de reutilizarlas. Una ventana incompleta o alterada bloquea el proceso y no se reemplaza automáticamente. `--verify` reconstruye todos los datos desde respuestas guardadas, sin red, y exige igualdad del CSV y manifiesto. La escritura del manifiesto final ocurre después del CSV. Sin manifiesto final no existe corpus completo; un CSV huérfano requiere revisión manual.

## Contrato y particiones

CSV UTF-8 sin BOM, LF y salto final. Columnas: `fecha_xm,periodo,demanda_real_kwh,partition,window_id,source_record_index`. El índice apunta a la fila del snapshot normalizado de su ventana; el manifiesto identifica hashes y fechas de adquisición. Orden fecha/periodo; sin imputación, escalamiento, recorte, redondeo ni ajuste de características. La serialización numérica puede omitir ceros decimales; los bytes originales permanecen en raw.json.

| Partición fija | Fechas objetivo | Filas esperadas | Uso posterior |
| --- | --- | ---: | --- |
| train | 2023-01-01..2024-12-31 | 17544 | Ajuste del baseline y contexto histórico |
| validation | 2025-01-01..2025-06-30 | 4344 | Selección de configuración |
| test | 2025-07-01..2025-12-31 | 4416 | Evaluación final con configuración congelada |

Se esperan 26304 filas y 1096 días, incluidos los 24 periodos del 29 de febrero de 2024. El control global exige coincidencia exacta con ese calendario. Las etiquetas de partición no autorizan usar targets futuros al formar contextos: esa comprobación deberá implementarse en el backtesting. No se entrenó ni se seleccionó ningún modelo durante esta preparación.

## Verificación ejecutada

21 de octubre de 2026, America/Bogota. `bun run typecheck`: aprobado. Suites `xm-hourly-demand-corpus.test.ts` y `xm-hourly-demand-acquisition.test.ts`: 27 pruebas aprobadas, cero fallidas y 144 aserciones. Bun 1.3.13. Estas pruebas utilizan datos sintéticos; la ejecución real y su reproducción se acreditan por `corpus-2023-2025/verification.json` y los manifiestos de sus ventanas.

| ID | HU | Precondición | Pasos | Resultado esperado | Resultado obtenido | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| CORPUS-01 | HU-01/02 | Protocolo fijo | 1. Generar ventanas. 2. Comprobar extremos y continuidad | 37 ventanas, máximo 30 días, sin huecos | Aprobado | Suite corpus |
| CORPUS-02 | HU-03 | Ventanas sintéticas válidas | 1. Preparar en dos órdenes. 2. Comparar salidas, fronteras e índices | CSV determinista; particiones exactas; día bisiesto completo | Aprobado | Suite corpus |
| CORPUS-03 | HU-02 | Conjunto incompleto o repetido | 1. Retirar/repetir ventana. 2. Preparar | Rechazo | Aprobado | Suite corpus |
| CORPUS-04 | HU-02 | Snapshot alterado | 1. Cambiar valor. 2. Preparar | Error de integridad | Aprobado | Suite corpus |
| CORPUS-REAL-01 | HU-01/02/03 | XM público y catálogo compatible | 1. Adquirir ventanas. 2. Preparar. 3. Reconstruir offline | 26304 filas y particiones exactas, hashes coincidentes | Consultar verification.json; no inferir éxito si falta | Manifiestos y verification.json |

## Límites y siguiente incremento

La calidad verificada es estructural y de procedencia, no validación semántica exhaustiva de valores energéticos ni desempeño de un modelo. El histórico se obtuvo posteriormente: no reconstruye hora original de publicación ni versiones disponibles en cada origen de 2025. No se ha descartado solapamiento con preentrenamiento de modelos fundacionales. No hay integración Prisma, entrenamiento, actualización de modelos activos ni cambios al informe académico.

Conservar localmente los snapshots; verificar permisos específicos antes de publicar datos originales. El paso siguiente es congelar el protocolo de backtesting de 24 periodos y ejecutar referencias estacionales y un baseline supervisado, con verificaciones de ausencia de información futura. Las pruebas finales no deben orientar decisiones de configuración.

Apoyo de IA generativa: Codex apoyó el diseño, implementación, adquisición y verificación. El estudiante debe revisar los artefactos y comprender el procedimiento antes de incorporarlo al informe TG-II. Conservar esta evidencia junto con los hashes y la versión del código.
