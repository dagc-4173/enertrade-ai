# HU-03 — Pruebas y cierre técnico del defecto P2002

Fecha de actualización documental: 2026-09-11.

## Procedencia de la evidencia

Se distinguen tres fuentes:

1. Código y pruebas locales revisados en este cierre.
2. Captura diagnóstica real anterior, realizada en esta conversación con
   PostgreSQL y registrada en la salida de consola de la sesión.
3. Preparación normal, reutilización secuencial y concurrencia posterior a la
   corrección, confirmadas expresamente por el usuario al solicitar este cierre.

En este paso se repitieron las pruebas automatizadas y typecheck, no la
integración PostgreSQL. No se adjuntan capturas, logs, HAR ni scripts de
integración que no estén guardados. Los datos de ejecución siguientes son una
transcripción de la evidencia disponible, no una reconstrucción de respuestas
HTTP completas. No se conoce el valor literal de preparedAt del caso 26/11.

## Precondiciones

- Backend Express ejecutado con Bun y DATABASE_URL configurada para PostgreSQL.
- Prisma, cliente y adapter-pg 7.8.0; pg 8.20.0, verificados en la auditoría local.
- Modelos EnergyDataset/PreparedDataset y migraciones disponibles; las pruebas
  reales confirmadas requieren persistencia operativa. No se volvió a consultar
  el estado de migraciones en este cierre.
- Dataset de generación compatible con el perfil, validado por HU-02 en aprobado
  o advertencia, con fecha e informe consistentes.
- Solicitud POST /datasets/:id/prepare sin body.
- Índice único esperado:
  `PreparedDataset_sourceDatasetId_profileId_profileVersion_key`.

## HU03-INT-01 — Preparación normal

- **HU:** HU-03.
- **Precondición:** dataset compatible validado, sin artefacto para el perfil/versión.
- **Pasos:** solicitar preparación y verificar el artefacto persistido.
- **Resultado esperado:** preparación completada; identificador propio y reused=false.
- **Resultado obtenido:** preparación normal correcta contra PostgreSQL real,
  con reused=false, según ejecución confirmada por el usuario.
- **Estado:** Probada técnicamente.
- **Evidencia:** confirmación de ejecución en la conversación. No se proporcionaron
  aquí los IDs de la ejecución secuencial original ni un archivo de log; no se
  les asigna el ID 26 por inferencia.

La integración previa también confirmó el caso con advertencia. Las exclusiones
de contexto están cubiertas adicionalmente por HU03-02 a HU03-06; no se inventa
una respuesta completa ni un ID para aquel caso real.

## HU03-SEQ-01 — Idempotencia secuencial

- **HU:** HU-03.
- **Precondición:** mismo dataset y misma combinación de perfil/versión.
- **Pasos:** preparar por primera vez y repetir después de completarse.
- **Resultado esperado:** primera respuesta reused=false; segunda reutiliza el
  mismo preparedDatasetId con reused=true.
- **Resultado obtenido:** exactamente ese comportamiento, confirmado contra
  PostgreSQL real por el usuario.
- **Estado:** Probada técnicamente.
- **Evidencia:** confirmación en la conversación; prueba automatizada HU03-23.
  La reutilización secuencial no prueba por sí misma el catch de P2002.

## HU03-CONC-01 — Defecto detectado antes de la corrección

- **HU:** HU-03.
- **Precondición:** dataset validado y sin preparado; dos solicitudes competidoras.
- **Pasos:** preparar concurrentemente y capturar la estructura del error en el
  catch de create. En la captura diagnóstica se usó una barrera en memoria en el
  script de prueba antes de las dos inserciones reales, sin sustituir PostgreSQL.
- **Resultado esperado:** un artefacto; ambas solicitudes recuperan ese resultado.
- **Resultado obtenido:** datasetId=25; una respuesta 200, preparedDatasetId=9,
  reused=false; otra 500 DATASET_PREPARATION_FAILED. Dos create llegaron a la
  barrera y PostgreSQL conservó un único artefacto.
- **Estado:** Falló antes de la corrección; defecto reproducido.
- **Evidencia:** consola de la sesión de diagnóstico. La instrumentación temporal
  se retiró posteriormente. Se limpió un artefacto y un dataset temporal; cero
  coincidencias restantes en esa ejecución.

Un intento diagnóstico anterior (datasetId=24, preparedDatasetId=8) devolvió
200/200 con reutilización, pero no produjo P2002; no se utilizó como demostración
de recuperación de colisión. Sus datos temporales también fueron limpiados.

## Causa técnica capturada y corrección

Estructura relevante observada, omitiendo mensajes internos:

```text
constructor/name: PrismaClientKnownRequestError
instanceof Prisma.PrismaClientKnownRequestError: true
code: P2002
clientVersion: 7.8.0
meta.modelName: PreparedDataset
meta.target: ausente
meta.driverAdapterError.constructor/name: DriverAdapterError
meta.driverAdapterError.cause.kind: UniqueConstraintViolation
meta.driverAdapterError.cause.originalCode: 23505
meta.driverAdapterError.cause.constraint.fields:
  ['"sourceDatasetId"', '"profileId"', '"profileVersion"']
```

Las comillas dobles forman parte de cada string. El adaptador extrae campos del
detail PostgreSQL sin retirar esas comillas. La comparación literal previa
esperaba nombres sin comillas y no reconocía la colisión.

expectedCollision conserva las formas previamente soportadas. Añade solo la
forma observada: modelName PreparedDataset, target ausente, nombre
DriverAdapterError, kind UniqueConstraintViolation, originalCode 23505 y los
tres identificadores entrecomillados en orden exacto. No se aplica una
normalización genérica ni se convierten todos los P2002 en reutilización.

Tras una colisión reconocida se consulta la clave compuesta y se devuelve el
ganador con reused=true. Si falta el ganador o falla la lectura, permanece el
fallo interno controlado. El cliente recibe el envelope seguro existente; no
se exponen mensajes internos. No se modificaron schema ni migraciones.

## HU03-CONC-02 — Concurrencia real posterior a la corrección

- **HU:** HU-03.
- **Precondición:** corrección aplicada; PostgreSQL real; mismo dataset y perfil.
- **Pasos confirmados:** ejecutar dos preparaciones concurrentes y comparar
  artefacto, reused y preparedAt de ambas respuestas.
- **Resultado esperado:** mismo artefacto para ambas solicitudes; una creación
  y una reutilización; mismo preparedAt; sin error de preparación.
- **Resultado obtenido, confirmado expresamente por el usuario:**

| Solicitud | datasetId | preparedDatasetId | reused | preparedAt | Resultado |
| --- | --- | --- | --- | --- | --- |
| 1 | 26 | 11 | false | Igual al de solicitud 2 | Exitosa |
| 2 | 26 | 11 | true | Igual al de solicitud 1 | Exitosa |

**Mismo artefacto para ambas solicitudes. No hubo HTTP 500 ni
DATASET_PREPARATION_FAILED.**

- **Estado:** Probada técnicamente contra PostgreSQL real, según ejecución
  confirmada por el usuario.
- **Evidencia disponible:** confirmación textual en la conversación. No se ha
  aportado archivo de log, captura ni valor literal de preparedAt para esta
  ejecución. Tampoco se afirma un mecanismo concreto de coordinación, source,
  fecha de ejecución o limpieza de 26/11 que no haya sido confirmado.

Los IDs corresponden a sus respectivas ejecuciones y no son valores fijos del sistema.

## Pruebas automatizadas y comprobaciones de este cierre

La suite abre HTTP en loopback y sustituye Prisma. Contiene 11 casos HU-01,
21 HU-02 y 34 HU-03. Sus resultados no sustituyen la prueba PostgreSQL anterior.

- HU03-27: carrera simulada y recuperación de colisión esperada.
- HU03-28: restricción ajena/error no identificado; respuesta segura.
- HU03-30: fallos de lectura y ganador ausente.
- HU03-31: forma previa del driver adapter con campos sin comillas.
- HU03-32: estructura capturada, usando DriverAdapterError real como clase del
  fixture; recuperación del ganador sin modificación.
- HU03-33: rechazo de 11 variantes, incluido Prisma P2003, otro modelo,
  restricción ajena, metadatos ambiguos y orden/comillas no observados.
- HU03-34: estructura capturada sin ganador; conserva 500 seguro.

| Comando desde backend, salvo git | Resultado ejecutado nuevamente |
| --- | --- |
| bun test | 66 aprobadas, 0 fallidas, 291 aserciones; código 0 |
| bun --bun run tsc --noEmit --incremental false -p tsconfig.json | Correcto, sin emisión; código 0 |
| git diff --check | Correcto; advertencias LF/CRLF. No incluye archivos nuevos sin seguimiento |

La salida de estas comprobaciones permanece en la conversación; no se generaron
archivos de logs. El diff y estado Git se muestran al finalizar el cierre.

## Estado final y limitaciones

HU-03, dentro del perfil backend v1: **Implementada y probada técnicamente**.
Defecto de reconocimiento del P2002 observado: **corregido**, con regresión
automatizada y concurrencia real posterior confirmada. **Validación
académica/formal: Pendiente**.

No se acredita prueba de carga, todos los posibles formatos futuros de Prisma,
integración frontend de HU-03 ni ejecución de modelos IA. La inmutabilidad se
respeta en el servicio; la restricción única no impide ediciones externas.
Los scripts de integración no forman parte de bun test. No se modificó el
documento académico principal ni se realizó commit en este paso.
