# ADR-08 — Preparación XM Gene sin normalización temporal

**Estado:** Aceptado para este incremento de HU-03.

## Contexto

HU-01 registra datasets genéricos; HU-02 admite xm_gene_base v1.0.0, cuya
identidad temporal es (fecha_xm, hora_xm). No existe semántica verificada que
permita convertir el periodo 1..24 en un instante. El perfil simulado actual
normaliza timestamps y no debe modificarse para adaptar XM.

Esta decisión complementa [ADR-07](ADR-07-validacion-xm-gene-sin-timestamp.md).
El rechazo histórico de preparación XM descrito allí corresponde al estado
anterior a la incorporación del perfil específico, no a un cambio del perfil
simulado.

## Alternativas consideradas

- Inferir hora local/UTC: descartado porque introduce semántica no demostrada.
- Ampliar el perfil simulado: descartado para preservar su contrato.
- Crear un perfil separado con identidad discreta: elegido; el modelo
  PreparedDataset existente admite content y transformations JSON.

## Decisión

Seleccionar exclusivamente por validationReport.rulesetId/rulesetVersion:

| Ruleset | Perfil |
| --- | --- |
| generacion_simulada_base v1.0.0 | generacion_simulada_preparacion_base v1.0.0 |
| xm_gene_base v1.0.0 | xm_gene_preparacion_base v1.0.0 |

No seleccionar por source ni por columnas. Las columnas se comprueban después
como precondición del perfil seleccionado. XM requiere generacion, aprobado,
validatedAt presente y un informe con recordCount entero positivo, errorCount=0,
warningCount=0 e issues=[]. Los estados recibido/rechazado conservan sus bloqueos.

Antes de crear un artefacto XM, comprobar estructura, columnas obligatorias
fecha_xm/hora_xm/energia_kwh, conteo e integridad de valores e identidad usando
evaluateXmGene. Esta comprobación no vuelve a persistir una validación.

El contenido preparado conserva únicamente fecha_xm, hora_xm, energia_kwh y
sourceRecordIndex, copiando cada fila sin alterar orden ni valores. variables
declara las tres variables mínimas y context=[]. sourceRecordIndex referencia
el índice original y no constituye una feature predictiva.

transformations describe temporalIdentity con fields=[fecha_xm,hora_xm],
representation=calendar-date-and-period y preserved=true. variableSelection
declara las tres variables mínimas, optionalContext=[] y unusedColumns con
todas las columnas adicionales declaradas, en su orden original.
excludedOptionalContext=[] y generatedFeatures=[].

Se decide deliberadamente no generar timestamp, fecha ISO, zona, agregaciones,
redondeos ni features. preparedAt continúa siendo el momento de creación del
artefacto; no representa el tiempo de una observación energética.

## Coexistencia e idempotencia

Se reutiliza la infraestructura actual de búsqueda, creación y recuperación
por (sourceDatasetId, profileId, profileVersion), usando el perfil seleccionado.
El perfil simulado, sus transformaciones y sus pruebas permanecen intactos.

expectedCollision no cambia: solo una colisión reconocida de la restricción
esperada permite buscar al ganador y devolver reused=true. Los errores ajenos
se propagan al envelope seguro; una colisión sin ganador conserva fallo interno.
La reutilización devuelve el artefacto existente sin transformar de nuevo el
contenido fuente, como en el flujo actual. Se presupone fuente inmutable.

## Errores y consecuencias

| Condición | Respuesta |
| --- | --- |
| Recibido | 409 DATASET_NOT_VALIDATED |
| Rechazado | 422 DATASET_REJECTED |
| Informe ausente/inconsistente o versión no soportada | 409 DATASET_VALIDATION_INCONSISTENT |
| Tipo o columnas no aplicables | 422 PREPARATION_PROFILE_NOT_APPLICABLE |
| Estructura, valores, identidad o conteo inconsistentes | 409 DATASET_CONTENT_INCONSISTENT |

Un dataset aprobado por xm_gene_base dispone ahora de su propio perfil; esto
no lo convierte en compatible con el perfil simulado. No se requieren cambios
Prisma, migraciones, HU-01, HU-02, proveedor XM ni frontend.

## Deuda técnica y límites de evidencia

- Semántica oficial de los periodos pendiente antes de cualquier conversión.
- Variables/features y aptitud para un modelo específico aún no definidas.
- No se certifica autenticidad, completitud histórica ni consistencia física.
- La unicidad no deduplica importaciones distintas ni impide ediciones externas.
- Recuperación P2002 real del perfil XM no observada en la integración descrita
  abajo; las pruebas automatizadas de esa rama no sustituyen su observación real.
- Validación académica/formal pendiente.

Verificación de este incremento: bun test, 187 aprobadas, 0 fallidas y 802
aserciones. Typecheck backend correcto mediante
`bun --bun run tsc --noEmit --incremental false -p tsconfig.json`.
Los casos XMP de dataset.test.ts usan HTTP local con Prisma sustituido; prueban
contenido exacto, errores, reutilización y recuperación P2002 con la estructura
capturada previamente. No se presentan como nueva integración PostgreSQL real.

## Integración real posterior

Express, XM y PostgreSQL reales completaron el flujo del EnergyDataset 31 al
PreparedDataset 12: importación 201, validación 200 con xm_gene_base v1.0.0
aprobado y preparación 200 con xm_gene_preparacion_base v1.0.0. La primera
preparación devolvió reused=false y la segunda el mismo artefacto con reused=true.

El dataset equivalente aislado 32 se validó con HTTP 200. Dos solicitudes de
preparación concurrentes devolvieron HTTP 200/200, PreparedDataset 13 y el mismo
preparedAt, una con reused=false y otra con reused=true. PostgreSQL confirmó
una fila por clave compuesta. No hubo HTTP 500 ni se observó P2002 real en esta
ejecución: no se acredita aquí ejecución de expectedCollision ante un P2002 real.

Se comprobaron 24 registros, índices 0..23, valores intactos, identidad discreta,
ausencia de timestamps/zona/features y conservación de los datasets fuente.
La limpieza eliminó preparados 12/13 y datasets 31/32, sin filas temporales
restantes. Detalles y procedencia en la [evidencia HU-03 XM](../evidencias/hu-03-xm-gene/README.md).

La regresión final confirmada fue de 187 aprobadas, 0 fallidas y 802 aserciones;
typecheck y git diff --check correctos. Son ejecuciones previas, no pruebas nuevas
de este cierre documental. Estado: implementado y probado técnicamente dentro
del alcance descrito; validación académica/formal y aptitud para modelos ML
pendientes.
