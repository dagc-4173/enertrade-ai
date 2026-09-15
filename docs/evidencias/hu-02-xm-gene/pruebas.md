# HU-02 XM Gene — Pruebas técnicas

## Procedencia y precondiciones

La primera integración real (IDs 27–29) se ejecutó con la aplicación Express
completa, Prisma real y conexión PostgreSQL. Un script temporal por entrada
estándar registró datos mediante HTTP y comprobó persistencia mediante SQL
directo con pg, sin sustituir Prisma. El usuario confirmó los resultados al
solicitar este cierre. No se repitió la integración en este paso documental.

En esa primera ejecución la entrada era controlada: no se llamó a XM ni se importó un preview. Todas las
solicitudes de registro usaron dataType `generacion` y estas columnas:

```json
[
  {"name":"fecha_xm","optional":false},
  {"name":"hora_xm","optional":false},
  {"name":"energia_kwh","optional":false}
]
```

Se usaron sources exclusivos con prefijo
`integration-xm-gene-5c0b39dd-b11b-44af-9efd-51ab4ffca1bd-` y sufijos
`valid`, `duplicate`, `invalid`. La consulta previa encontró cero coincidencias.
No se incluyen credenciales ni cadenas de conexión. No se adjuntan archivos
de log, capturas, HAR o scripts inexistentes; esta es una transcripción resumida
de la salida de la sesión. No se asignan timestamps nuevos a las pruebas.

Los identificadores de caso siguientes organizan este expediente; no son IDs
generados por la aplicación. Los datasetId 27, 28 y 29 sí son los observados.

## HU02-XM-INT-01 — Dataset válido

- **HU:** HU-02, registro previo HU-01.
- **Precondición:** servicios HTTP y PostgreSQL disponibles; source exclusivo.
- **Acción:** POST /datasets con los registros siguientes; luego POST
  /datasets/27/validate sin body y lectura SQL de la fila.

```json
[
  {"fecha_xm":"2024-04-01","hora_xm":1,"energia_kwh":8305353.94},
  {"fecha_xm":"2024-04-01","hora_xm":24,"energia_kwh":8000000}
]
```

- **Esperado:** registro 201; validación 200, aprobado, sin errores/advertencias,
  canProceed=true e informe persistido.
- **Obtenido:** datasetId=27, registro 201, validación 200; status=aprobado,
  rulesetId=xm_gene_base, rulesetVersion=1.0.0, recordCount=2, errorCount=0,
  warningCount=0, issues=[], canProceed=true.
- **PostgreSQL:** estado, validationReport y validatedAt coincidieron con HTTP;
  content.columns y content.records permanecieron iguales a la entrada.
- **Estado:** Probado técnicamente, resultado esperado cumplido.

## HU02-XM-INT-02 — Periodo duplicado

- **HU:** HU-02.
- **Precondición:** mismas condiciones; nuevo source exclusivo.
- **Acción:** registrar dos filas de fecha 2024-04-01, ambas hora_xm=1, con
  energia_kwh=8305353.94 y 8000000; validar ID 28 y consultar SQL.
- **Esperado:** registro 201; validación 200 con rechazado por periodo duplicado,
  canProceed=false; informe persistido.
- **Obtenido:** datasetId=28; HTTP 201/200; status=rechazado,
  rulesetId=xm_gene_base, rulesetVersion=1.0.0, recordCount=2, errorCount=1,
  warningCount=0, canProceed=false. Issue DUPLICATE_XM_PERIOD, field=hora_xm,
  severity=error, recordIndex=1 y relatedRecordIndex=0.
- **PostgreSQL:** estado, informe y validatedAt coincidentes con HTTP;
  contenido original intacto.
- **Estado:** Probado técnicamente, resultado esperado cumplido.

## HU02-XM-INT-03 — Fecha y periodo inválidos

- **HU:** HU-02.
- **Precondición:** mismas condiciones; nuevo source exclusivo.
- **Acción:** registrar una fila con fecha_xm=2024-02-30, hora_xm=25,
  energia_kwh=8000000; validar ID 29 y consultar SQL.
- **Esperado:** registro 201; validación 200 con rechazado e Issues XM para fecha
  y hora; canProceed=false e informe persistido.
- **Obtenido:** datasetId=29; HTTP 201/200; status=rechazado,
  rulesetId=xm_gene_base, rulesetVersion=1.0.0, recordCount=1, errorCount=2,
  warningCount=0, canProceed=false. Issues INVALID_XM_DATE (fecha_xm) e
  INVALID_XM_HOUR (hora_xm), ambos severity=error, recordIndex=0.
- **PostgreSQL:** estado, informe y validatedAt coincidentes con HTTP;
  contenido original intacto.
- **Estado:** Probado técnicamente, resultado esperado cumplido.

## HU02-XM-INT-04 — Aprobado no implica preparación disponible

- **HU:** compatibilidad HU-02 → HU-03.
- **Precondición:** ID 27 aprobado con xm_gene_base v1.0.0 y canProceed=true;
  cero PreparedDataset asociados.
- **Acción:** POST /datasets/27/prepare sin body; consultar PreparedDataset antes
  y después mediante SQL.
- **Esperado:** rechazo controlado del perfil simulado, sin crear artefactos.
- **Obtenido exacto:** HTTP 409, error=DATASET_VALIDATION_INCONSISTENT,
  message="El informe de validación es inconsistente con el perfil.".
- **PostgreSQL:** cero PreparedDataset antes y después. No se generó un
  preparedDatasetId.
- **Estado:** Probado técnicamente, resultado esperado cumplido.

## Limpieza y conservación de evidencia

La limpieza usó IDs y sources exclusivos, sin borrar filas ajenas. Se eliminaron
únicamente los datasets 27, 28 y 29; se eliminaron cero PreparedDataset.
Las comprobaciones finales dieron cero datasets temporales y cero preparados
asociados restantes. No se reiniciaron secuencias ni se reutilizan esos IDs como
datos actuales. El servidor HTTP temporal se cerró al terminar.

## Regresión del cierre inicial de HU-02 XM (anterior a importación)

| Comando | Resultado |
| --- | --- |
| bun test (backend) | 155 aprobadas, 0 fallidas, 583 aserciones, código 0 |
| bun --bun run tsc --noEmit --incremental false -p tsconfig.json (backend) | Correcto, código 0 |
| git diff --check | Sin errores de whitespace; comprobación adicional de documentos nuevos sin seguimiento |

La suite incluye 35 casos nuevos XM y 120 pruebas previas; sus dobles Prisma
no sustituyen la evidencia SQL descrita arriba. Las salidas se conservaron en
la conversación, no en archivos de logs. **Validación académica/formal pendiente**.

## Integración posterior — Importación XM real y validación manual

Procedencia: ejecución real previa mediante script temporal por stdin con
Express, XM y PostgreSQL reales, confirmada por el usuario. No se repite en
este paso documental. No se adjuntan capturas, logs, scripts ni timestamps
adicionales. Los identificadores de caso siguientes organizan la evidencia.

### XM-IMPORT-INT-01 — Importación Gene

- **Precondición:** backend y PostgreSQL disponibles, XM real; consulta de un día.
- **Acción:** POST /external-data/import con el siguiente body:

```json
{"provider":"xm","dataset":"Gene","startDate":"2024-04-01","endDate":"2024-04-01"}
```

- **Esperado:** HTTP 201, dataset de generación recibido, 24 registros, source
  trazable y persistencia sin ejecutar HU-02 automáticamente.
- **Obtenido:** EnergyDataset ID 30, HTTP 201, status=recibido,
  dataType=generacion, recordCount=24. Source exacto:

```text
XM/SINERGOX;metric=Gene;unit=kWh;startDate=2024-04-01;endDate=2024-04-01;mapping=xm-gene-v1
```

| Observación | fecha_xm | hora_xm | energia_kwh |
| --- | --- | ---: | ---: |
| Primera | 2024-04-01 | 1 | 8305353.94 |
| Última | 2024-04-01 | 24 | 9251914.57 |

- **PostgreSQL:** 24 registros coincidentes con el contenido normalizado desde
  XM; columnas obligatorias fecha_xm, hora_xm, energia_kwh, sin fecha ISO ni zona.
  Antes de HU-02: status=recibido, validatedAt=null, validationReport=null.
- **Estado:** Probado técnicamente, resultado esperado cumplido.

### XM-IMPORT-INT-02 — HU-02 solicitada manualmente

- **Precondición:** ID 30 importado y todavía recibido.
- **Acción:** POST /datasets/30/validate sin body, seguido de comprobación SQL.
- **Esperado:** HTTP 200, aprobado bajo xm_gene_base v1.0.0, sin errores ni
  advertencias, canProceed=true, informe persistido y contenido intacto.
- **Obtenido:** HTTP 200, rulesetId=xm_gene_base, rulesetVersion=1.0.0,
  status=aprobado, errorCount=0, warningCount=0, canProceed=true, recordCount=24.
- **PostgreSQL:** status aprobado, validationReport y validatedAt persistidos;
  contenido original sin transformación.
- **Estado:** Probado técnicamente, resultado esperado cumplido.

HU-03 no se ejecutó sobre el ID 30. Esta aprobación no declara compatible el
perfil simulado; el perfil de preparación XM sigue pendiente.

### XM-IMPORT-INT-03 — Rechazo de otra métrica

- **Precondición:** endpoint de importación limitado a Gene.
- **Acción:** POST /external-data/import con provider=xm, dataset=DemaSIN y
  startDate=endDate=2024-04-01.
- **Esperado:** rechazo controlado sin escrituras.
- **Obtenido:** HTTP 400 UNSUPPORTED_EXTERNAL_DATASET; cero escrituras.
- **Estado:** Probado técnicamente, resultado esperado cumplido.

### Limpieza de la importación

Se eliminó exclusivamente EnergyDataset ID 30 usando ID y source exactos.
La comprobación final dio cero coincidencias restantes. No se borraron registros
ajenos. El ID 30 es histórico y no representa una fila que siga disponible.

### Verificaciones posteriores a la integración, ya ejecutadas

| Comando | Resultado confirmado |
| --- | --- |
| bun test (backend) | 174 aprobadas, 0 fallidas, 736 aserciones |
| typecheck backend | Correcto |
| git diff --check | Correcto |

Estos resultados complementan la regresión anterior de 155 pruebas; no la
reemplazan como registro histórico. La integración no demuestra idempotencia,
autenticidad criptográfica, completitud histórica ni preparación XM.
**Validación académica/formal pendiente**.
