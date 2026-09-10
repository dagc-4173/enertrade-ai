# Pruebas verificadas — HU-02

## Procedencia

Transcripción de resultados ya verificados en la sesión de trabajo, no una nueva ejecución. La suite usa HTTP local y Prisma sustituido. Las pruebas reales se ejecutaron aparte con la aplicación y PostgreSQL reales mediante un script en memoria; no se guardó ese script ni se incorporó a bun test.

Evidencia automatizada: [dataset.test.ts](../../../backend/src/tests/dataset.test.ts) y salida de la sesión: 32 aprobadas, 0 fallidas, 165 aserciones (21 HU-02 y 11 regresiones HU-01, incluida /auth). No se adjuntan logs crudos externos.

## HU02-01 — Aprobación

- **ID:** HU02-01.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Validar la referencia válida.
- **Resultado esperado:** HTTP 200, aprobado, sin hallazgos y canProceed true.
- **Resultado obtenido:** HTTP 200, aprobado, sin hallazgos y canProceed true. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-01 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-02 — Zona faltante

- **ID:** HU02-02.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Evaluar zona ausente, null, vacía y espacios.
- **Resultado esperado:** advertencia y únicamente OPTIONAL_VALUE_MISSING.
- **Resultado obtenido:** advertencia y únicamente OPTIONAL_VALUE_MISSING. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-02 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-03 — Tipo de zona

- **ID:** HU02-03.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Evaluar zona 0 y false.
- **Resultado esperado:** OPTIONAL_TYPE_MISMATCH.
- **Resultado obtenido:** OPTIONAL_TYPE_MISMATCH. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-03 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-04 — Críticos vacíos

- **ID:** HU02-04.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Evaluar null, vacío y espacios en fecha/energia_kwh; después eliminar cada propiedad.
- **Resultado esperado:** CRITICAL_VALUE_MISSING sin hallazgos redundantes; propiedad ausente devuelve 409 estructural.
- **Resultado obtenido:** CRITICAL_VALUE_MISSING sin hallazgos redundantes; propiedad ausente devuelve 409 estructural. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-04 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-05 — Tipos críticos

- **ID:** HU02-05.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Evaluar fecha numérica/boolean y energía string/boolean.
- **Resultado esperado:** Únicamente CRITICAL_TYPE_MISMATCH por el valor.
- **Resultado obtenido:** Únicamente CRITICAL_TYPE_MISMATCH por el valor. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-05 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-06 — Cero y negativos

- **ID:** HU02-06.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Evaluar energía 0 y -12.5.
- **Resultado esperado:** aprobado, sin restricciones de rango o signo.
- **Resultado obtenido:** aprobado, sin restricciones de rango o signo. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-06 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-07 — Fechas admitidas

- **ID:** HU02-07.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Evaluar Z, offsets, fracciones de 0 a 3 dígitos, fecha bisiesta y año 0099.
- **Resultado esperado:** aprobado en los casos probados.
- **Resultado obtenido:** aprobado en los casos probados. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-07 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-08 — Fechas inválidas

- **ID:** HU02-08.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Evaluar falta de offset/componentes, fechas imposibles, espacios, cuatro decimales, hora 24 y offset +24:00.
- **Resultado esperado:** Únicamente INVALID_TIMESTAMP por fecha.
- **Resultado obtenido:** Únicamente INVALID_TIMESTAMP por fecha. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-08 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-09 — Duplicidad temporal

- **ID:** HU02-09.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Añadir dos representaciones equivalentes al instante de la primera fila.
- **Resultado esperado:** Dos DUPLICATE_TEMPORAL_IDENTITY, índices 1 y 2 relacionados con 0.
- **Resultado obtenido:** Dos DUPLICATE_TEMPORAL_IDENTITY, índices 1 y 2 relacionados con 0. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-09 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-10 — Instantes diferentes

- **ID:** HU02-10.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Añadir igual energía con una fecha anterior y distinta.
- **Resultado esperado:** aprobado; sin duplicidad ni exigencia de orden.
- **Resultado obtenido:** aprobado; sin duplicidad ni exigencia de orden. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-10 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-11 — Error y advertencia

- **ID:** HU02-11.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Asignar null a energía y zona.
- **Resultado esperado:** rechazado, 1 error, 1 warning, canProceed false.
- **Resultado obtenido:** rechazado, 1 error, 1 warning, canProceed false. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-11 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-12 — Inexistencia

- **ID:** HU02-12.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Hacer que findUnique devuelva null.
- **Resultado esperado:** 404 DATASET_NOT_FOUND, sin update.
- **Resultado obtenido:** 404 DATASET_NOT_FOUND, sin update. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-12 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-13 — Tipo no aplicable

- **ID:** HU02-13.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Usar dataType consumo.
- **Resultado esperado:** 422 RULESET_NOT_APPLICABLE, sin update.
- **Resultado obtenido:** 422 RULESET_NOT_APPLICABLE, sin update. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-13 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-14 — Columnas incompatibles

- **ID:** HU02-14.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Declarar fecha opcional; después retirar columna y valor zona.
- **Resultado esperado:** 422, sin update.
- **Resultado obtenido:** 422, sin update. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-14 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-15 — Contenido corrupto

- **ID:** HU02-15.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Probar content null, objeto vacío, arrays vacíos y estructura de registro inválida.
- **Resultado esperado:** 409 DATASET_CONTENT_INCOMPATIBLE, sin update.
- **Resultado obtenido:** 409 DATASET_CONTENT_INCOMPATIBLE, sin update. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-15 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-16 — Validación previa

- **ID:** HU02-16.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Probar estados aprobado, advertencia y rechazado.
- **Resultado esperado:** 409, sin update.
- **Resultado obtenido:** 409, sin update. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-16 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-17 — Fallos técnicos

- **ID:** HU02-17.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Simular fallo de lectura, rechazo de persistencia y excepción al inspeccionar contenido mediante Proxy.
- **Resultado esperado:** 500 controlado; no se cambia el doble a rechazado. No acredita atomicidad real por sí sola.
- **Resultado obtenido:** 500 controlado; no se cambia el doble a rechazado. No acredita atomicidad real por sí sola. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-17 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-18 — Competencia simulada

- **ID:** HU02-18.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Coordinar dos lecturas con una barrera y un updateMany simulado que cambia el estado una sola vez.
- **Resultado esperado:** Una respuesta 200, otra 409, dos intentos de update; estado aprobado.
- **Resultado obtenido:** Una respuesta 200, otra 409, dos intentos de update; estado aprobado. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-18 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-19 — Escritura y conservación

- **ID:** HU02-19.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Comparar argumentos de updateMany, respuesta y copia previa del doble.
- **Resultado esperado:** where id=1/status recibido; solo status, validatedAt y validationReport en data; contenido original intacto.
- **Resultado obtenido:** where id=1/status recibido; solo status, validatedAt y validationReport en data; contenido original intacto. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-19 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-20 — Contrato HTTP

- **ID:** HU02-20.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Solicitar sin body; enviar cuerpos {}, rulesetId, JSON mal formado y null; probar IDs inválidos.
- **Resultado esperado:** Sin body: 200. Cuerpos no vacíos e IDs inválidos: 400.
- **Resultado obtenido:** Sin body: 200. Cuerpos no vacíos e IDs inválidos: 400. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-20 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## HU02-21 — Count cero

- **ID:** HU02-21.
- **HU:** HU-02.
- **Precondición:** servidor HTTP local; referencia generacion en recibido, columnas fecha/energia_kwh obligatorias y zona opcional; dobles findUnique y updateMany reiniciados.
- **Pasos:** Simular updateMany count=0 seguido de desaparición; después mantener recibido.
- **Resultado esperado:** 404 si desaparece; 500 controlado ante estado inesperado.
- **Resultado obtenido:** 404 si desaparece; 500 controlado ante estado inesperado. Las aserciones del caso pasaron.
- **Estado:** Probado.
- **Evidencia:** caso HU02-21 de [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada conservada en la sesión.

## Precondiciones comunes de pruebas reales

Migraciones aplicadas y cliente generado; configuración de desarrollo existente; aplicación Express ejecutada con Bun en loopback. Se comprobó ausencia previa de los sources de prueba. Cada dataset se creó mediante POST /datasets con HTTP 201, estado recibido y validatedAt/validationReport nulos. La validación se solicitó sin body y sin Content-Type.

Columnas: fecha optional=false, energia_kwh optional=false, zona optional=true. Fecha del registro: 2026-09-09T12:00:00Z. Cada dataset contenía una fila.

## HU02-INT-01 — Advertencia real

- **ID:** HU02-INT-01.
- **HU:** HU-02.
- **Precondición:** condiciones comunes; source TGII-HU02-INTEGRATION-TEST, energía 12.5 y zona null.
- **Pasos:** registrar; consultar fila anterior; validar por HTTP; consultar PostgreSQL y comparar contenido, pendientes, metadatos e informe.
- **Resultado esperado:** HTTP 200, advertencia por zona, informe persistido y originales intactos.
- **Resultado obtenido:** id=4 en esa ejecución; HTTP 200; status advertencia; rulesetId generacion_simulada_base; rulesetVersion 1.0.0; recordCount=1; errorCount=0; warningCount=1; canProceed=true; validatedAt=2026-09-10T04:49:57.123Z. Hallazgo OPTIONAL_VALUE_MISSING, severity warning, field zona, recordIndex 0, message «Falta el valor opcional de zona.»
- **Estado:** Probado.
- **Evidencia:** respuesta y fila emitidas en la sesión, con comparaciones satisfactorias. PostgreSQL coincidió con el informe; content y pendingOptionalFields permanecieron intactos, al igual que source, dataType y uploadedAt (2026-09-10T04:49:56.880Z).

## HU02-SEQ-01 — Segunda validación

- **ID:** HU02-SEQ-01.
- **HU:** HU-02.
- **Precondición:** dataset 4 ya validado en HU02-INT-01.
- **Pasos:** solicitar nuevamente validación; consultar y comparar la fila completa.
- **Resultado esperado:** conflicto sin sobrescritura.
- **Resultado obtenido:** HTTP 409, DATASET_ALREADY_VALIDATED; fila completa sin cambios.
- **Estado:** Probado.
- **Evidencia:** respuesta y comparación de igualdad de la fila en la sesión.

## HU02-CONC-01 — Concurrencia PostgreSQL real

- **ID:** HU02-CONC-01.
- **HU:** HU-02.
- **Precondición:** source TGII-HU02-CONCURRENCY-TEST; id=5 en esa ejecución; energía 12.5, zona etiqueta-simulada, recibido y sin informe.
- **Pasos:** una conexión independiente bloqueó exclusivamente la fila por id/source mediante SELECT FOR UPDATE; se iniciaron dos solicitudes HTTP concurrentes, esperando ambas mediante Promise.all; se refrescó la instantánea de actividad y se observaron UPDATE esperando bloqueo; se liberó el bloqueo con ROLLBACK; se consultó la fila después de ambas respuestas y se comparó con la ganadora.
- **Resultado esperado:** dos escrituras competidoras reales, exactamente un HTTP 200 y un 409; informe ganador persistido sin sobrescritura.
- **Resultado obtenido:** ambas solicitudes iniciadas a 2026-09-10T04:49:58.488Z; dos sesiones UPDATE observadas esperando bloqueo; 0 solicitudes completadas antes de liberarlo; respuestas 200 y 409, ninguna 500. La perdedora devolvió DATASET_ALREADY_VALIDATED. Estado final aprobado, errorCount=0, warningCount=0, issues=[], recordCount=1 y canProceed=true; validatedAt=2026-09-10T04:49:58.570Z. Ruleset generacion_simulada_base v1.0.0.
- **Estado:** Probado.
- **Evidencia:** observación real de bloqueos, respuestas HTTP y consulta PostgreSQL de la sesión. Resultado ganador coincidente; content, pendingOptionalFields y metadatos originales intactos; lectura posterior sin sobrescritura.

El bloqueo fue coordinación externa de prueba, no un cambio al mecanismo productivo. La prueba acredita competencia entre dos solicitudes en este caso, no una prueba general de carga.

El primer intento obtuvo 200/409, pero no se consideró evidencia suficiente de concurrencia porque la observación no acreditó los dos UPDATE bloqueados. Se limpiaron sus registros y se repitió correctamente refrescando la instantánea de actividad de PostgreSQL.

## HU02-REJ-01 — Rechazo real

- **ID:** HU02-REJ-01.
- **HU:** HU-02.
- **Precondición:** source TGII-HU02-REJECTED-TEST; id=6 en esa ejecución; energia_kwh string "12.5", zona etiqueta-simulada; registro aceptado por HU-01.
- **Pasos:** registrar, validar, consultar PostgreSQL y comparar respuesta y contenido original.
- **Resultado esperado:** evaluación completada HTTP 200 con rechazo de calidad, sin convertir el string.
- **Resultado obtenido:** HTTP 200; status rechazado; errorCount=1; warningCount=0; recordCount=1; canProceed=false; validatedAt=2026-09-10T04:50:00.141Z. Ruleset generacion_simulada_base v1.0.0. Hallazgo CRITICAL_TYPE_MISMATCH, severity error, field energia_kwh, recordIndex 0, message «El valor crítico tiene un tipo incompatible.» Informe y estado persistidos; string original "12.5" conservado.
- **Estado:** Probado.
- **Evidencia:** respuesta e informe PostgreSQL coincidentes en la sesión; comparación de contenido, pendientes y metadatos originales satisfactoria.

## Limpieza verificada

Todos los IDs siguientes pertenecen exclusivamente a esas ejecuciones; no son identificadores fijos del sistema.

| ID | source | Filas eliminadas | Coincidencias posteriores por source |
| --- | --- | --- | --- |
| 4 | TGII-HU02-INTEGRATION-TEST | 1 | 0 |
| 5 | TGII-HU02-CONCURRENCY-TEST | 1 | 0 |
| 6 | TGII-HU02-REJECTED-TEST | 1 | 0 |

Cada eliminación utilizó simultáneamente id y source esperado. Los IDs 2 y 3 del intento anterior también se eliminaron específicamente con sus respectivos sources de integración y concurrencia. No se reiniciaron secuencias ni se eliminaron datos ajenos. La limpieza no forma parte del comportamiento funcional de HU-02.

## Comprobaciones finales ya ejecutadas

| Comando desde backend | Resultado |
| --- | --- |
| bun test | 32 aprobadas, 0 fallidas, 165 aserciones; código 0 |
| bun --bun run prisma validate | Correcto; código 0 |
| bun --bun run tsc --noEmit --incremental false -p tsconfig.json | Correcto, sin emisión; código 0 |
| git diff --check | Correcto, código 0, con advertencias LF/CRLF |

git diff --check no incluye archivos nuevos sin seguimiento. Las comprobaciones anteriores se documentan como evidencia histórica; no se repitieron pruebas funcionales al crear este expediente.

La validación formal/académica permanece Pendiente. El rechazo indica canProceed=false; no se ejecutó un pipeline HU-03.
