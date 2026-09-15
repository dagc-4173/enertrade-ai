# HU-03 — Preparación de XM Gene

## Objetivo y alcance

Preparar datasets aprobados con xm_gene_base v1.0.0 mediante
`POST /datasets/:id/prepare`, sin body. El perfil específico es
`xm_gene_preparacion_base` v1.0.0. Conserva fecha calendario, periodo XM y energía
sin inferir timestamps, zona ni features. El perfil simulado no se modifica.

| Dimensión | Estado |
| --- | --- |
| Perfil XM y persistencia | Implementado |
| Pruebas automatizadas con Prisma sustituido | Probado técnicamente |
| Flujo XM real → importación → HU-02 → HU-03 → PostgreSQL | Probado técnicamente |
| Idempotencia secuencial con PostgreSQL | Probado técnicamente |
| Concurrencia real, mismo artefacto y una fila por clave | Probado técnicamente |
| Recuperación ante P2002 real en esta ejecución XM | No observada |
| Aptitud para modelos ML | Pendiente; no acreditada |
| Validación académica/formal | Pendiente |

## Implementación y decisiones

- [Perfil XM](../../../backend/src/services/dataset-preparation-xm-gene.profile.ts).
- [Selección, persistencia e idempotencia](../../../backend/src/services/dataset-preparation.service.ts).
- [Pruebas automatizadas](../../../backend/src/tests/dataset.test.ts).
- [ADR-08](../../adr/ADR-08-preparacion-xm-gene-sin-normalizacion-temporal.md).

La selección utiliza rulesetId/rulesetVersion del informe. Los registros
preparados contienen solo sourceRecordIndex, fecha_xm, hora_xm y energia_kwh,
preservando orden y valores. La identidad es (fecha_xm, hora_xm), no un instante.
preparedAt fecha la creación del artefacto y no es un timestamp de observación.

La unicidad se mantiene por sourceDatasetId + profileId + profileVersion.
La reutilización devuelve el artefacto existente; no deduplica importaciones
independientes. La infraestructura P2002 se conserva, pero su recuperación real
no se deduce únicamente de respuestas concurrentes exitosas.

## Evidencia y límites

[pruebas.md](pruebas.md) registra precondiciones, acciones, resultados HTTP,
comprobaciones PostgreSQL y limpieza de 31/12 y 32/13. Se documentan ejecuciones
previas observadas en la sesión y confirmadas por el usuario. No se repiten
en este cierre documental ni se adjuntan capturas, HAR, logs o scripts no guardados.

Los IDs son históricos: las filas temporales fueron eliminadas. No se afirma
completitud histórica, autenticidad criptográfica, semántica horaria oficial,
pruebas de carga, integración frontend o aptitud para un modelo ML.

Los expedientes anteriores de HU-02 XM describen el estado previo en que aún no
existía este perfil. Este expediente acredita la incorporación posterior del
perfil XM específico, sin convertirlo en compatible con el perfil simulado.
**Validación académica/formal pendiente.**
