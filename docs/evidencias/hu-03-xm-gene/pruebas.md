# HU-03 XM Gene — Pruebas técnicas reales

## Procedencia y precondiciones

Resultados de la ejecución previa con script temporal por stdin, aplicación
Express completa y PostgreSQL real; confirmados por el usuario para este cierre.
El caso principal consultó XM real mediante POST /external-data/import. Para
concurrencia se registró mediante HU-01 un segundo dataset aislado con los mismos
datos obtenidos, sin afirmar una segunda consulta al proveedor.

La persistencia se comprobó con consultas SQL directas. El script no fue
versionado. No se adjuntan capturas, logs, HAR ni timestamps no conservados.
Los identificadores de prueba siguientes organizan este documento; los IDs de
EnergyDataset y PreparedDataset sí son los realmente observados.

Precondiciones comunes: Express y PostgreSQL disponibles, perfil XM implementado,
datos de Gene para 2024-04-01, y validación manual con xm_gene_base v1.0.0.

## HU03-XM-INT-01 — Preparación real

- **HU:** HU-03; antecedentes HU-01 y HU-02.
- **Precondición:** consulta XM real de un día disponible.
- **Acción:** POST /external-data/import con provider=xm, dataset=Gene,
  startDate=endDate=2024-04-01; validar el ID obtenido y solicitar preparación.
- **Esperado:** importación 201, validación aprobada 200, preparación 200 con
  perfil XM, reused=false y artefacto persistido.
- **Obtenido:** EnergyDataset 31; import 201, validate 200, prepare 200.
  xm_gene_base v1.0.0 aprobado; PreparedDataset 12 bajo
  xm_gene_preparacion_base v1.0.0, reused=false.
- **Estado:** Probado técnicamente, resultado esperado cumplido.

## HU03-XM-SEQ-01 — Idempotencia secuencial

- **Precondición:** EnergyDataset 31 aprobado y PreparedDataset 12 existente.
- **Acción:** repetir POST /datasets/31/prepare.
- **Esperado:** mismo PreparedDataset, reused=true y una fila por clave compuesta.
- **Obtenido:** HTTP 200, PreparedDataset 12, reused=true; primera preparación
  reused=false. PostgreSQL confirmó una única fila para dataset/perfil/versión.
- **Estado:** Probado técnicamente, resultado esperado cumplido.

## HU03-XM-CONC-01 — Concurrencia real

- **Precondición:** EnergyDataset 32 aislado, con datos equivalentes al caso
  principal; validación manual HTTP 200 y sin preparado previo.
- **Acción:** lanzar dos POST /datasets/32/prepare concurrentes.
- **Esperado:** ambas respuestas 200, mismo artefacto y preparedAt, una creación
  y una reutilización; una fila por clave compuesta.
- **Obtenido:**

| Solicitud | HTTP | EnergyDataset | PreparedDataset | reused | preparedAt |
| --- | ---: | ---: | ---: | --- | --- |
| 1 | 200 | 32 | 13 | false | Igual al de solicitud 2 |
| 2 | 200 | 32 | 13 | true | Igual al de solicitud 1 |

- **PostgreSQL:** una sola fila para sourceDatasetId=32,
  profileId=xm_gene_preparacion_base, profileVersion=1.0.0.
- **Estado:** Probado técnicamente, resultado esperado cumplido; ningún HTTP 500.
- **Límite:** no se observó P2002 real. No se afirma que esta ejecución recorrió
  expectedCollision ni la recuperación del ganador tras una excepción P2002.
  Esa rama conserva cobertura automatizada con Prisma sustituido.

## Comprobación PostgreSQL de ambos artefactos

PreparedDataset 12 corresponde a EnergyDataset 31; PreparedDataset 13 corresponde
a EnergyDataset 32. Se verificaron perfil/versión, contenido y transformaciones
coincidentes con HTTP, y una fila por cada clave compuesta.

Ambos artefactos conservan 24 registros e índices sourceRecordIndex 0..23:

| Observación | sourceRecordIndex | fecha_xm | hora_xm | energia_kwh |
| --- | ---: | --- | ---: | ---: |
| Primera | 0 | 2024-04-01 | 1 | 8305353.94 |
| Última | 23 | 2024-04-01 | 24 | 9251914.57 |

Se comprobó igualdad de todos los registros con la fuente, añadiendo únicamente
sourceRecordIndex. No existe campo fecha ISO generado ni zona.
transformations.temporalIdentity.fields=["fecha_xm","hora_xm"];
generatedFeatures=[]. Los datasets fuente permanecieron intactos.

## Limpieza

Se eliminaron exclusivamente los PreparedDataset 12/13 y EnergyDataset 31/32
creados por esta ejecución, comprobando IDs y sources exactos. La verificación
final confirmó cero datasets temporales y cero preparados asociados restantes.
No se borraron datos ajenos. No se presentan estos IDs como filas aún disponibles.

## Pruebas finales ya ejecutadas

| Comando | Resultado confirmado |
| --- | --- |
| bun test (backend) | 187 aprobadas, 0 fallidas, 802 aserciones |
| typecheck backend | Correcto |
| git diff --check | Correcto |

Estas verificaciones se ejecutaron después de la integración, no nuevamente en
este paso documental. La suite automatizada sustituye Prisma y no reemplaza las
comprobaciones SQL reales anteriores. No se acredita aptitud para modelos ML.
**Validación académica/formal pendiente.**
