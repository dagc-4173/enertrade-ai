# HU-02 — Validación de datasets compatibles con XM Gene

## Objetivo y alcance

Validar el formato XM Gene mediante `POST /datasets/:id/validate`, sin body,
con `xm_gene_base` v1.0.0. HU-01 registra previamente el dataset genérico.
El ruleset no consulta XM ni prepara datos. Este expediente incorpora también
la integración posterior de importación XM real mediante HU-01 y validación
manual mediante HU-02; la preparación XM permanece pendiente.
El resultado acredita conformidad con el ruleset, no autenticidad de la fuente.

| Dimensión | Estado |
| --- | --- |
| Ruleset XM y selección en HU-02 | Implementado |
| Pruebas automatizadas con Prisma sustituido | Probado técnicamente |
| Registro y validación HTTP con PostgreSQL real | Probado técnicamente |
| Importación XM real → HU-01 → PostgreSQL → HU-02 manual (ID 30) | Probado técnicamente |
| Bloqueo del perfil simulado de HU-03 para XM | Probado técnicamente |
| Perfil de preparación XM | Pendiente |
| Validación académica/formal | Pendiente |

## Implementación y decisiones

- [Evaluador XM](../../../backend/src/services/dataset-validation-xm-gene.rules.ts).
- [Selección y persistencia HU-02](../../../backend/src/services/dataset-validation.service.ts).
- [Pruebas automatizadas](../../../backend/src/tests/dataset.test.ts), casos XM-01 a XM-14, con parametrizaciones.
- [ADR-07](../../adr/ADR-07-validacion-xm-gene-sin-timestamp.md).

Para dataType `generacion`, las columnas obligatorias `fecha_xm`, `hora_xm` y
`energia_kwh` seleccionan XM cuando no aplica el contrato simulado, que mantiene
prioridad. Se verifica fecha calendario YYYY-MM-DD, periodo entero 1..24,
energía finita e identidad única `(fecha_xm, hora_xm)`. No se generan timestamps,
no se exige zona y no se rechaza energía negativa. No se exigen días completos.

Los resultados son aprobado o rechazado; warningCount siempre es 0 en esta
versión. La estructura incompatible conserva HTTP 409; el contrato de columnas
no aplicable, HTTP 422. El contenido original no se transforma al validar.

`canProceed=true` no garantiza un perfil de preparación disponible. El informe
XM no es compatible con `generacion_simulada_preparacion_base` v1.0.0.

## Evidencia y límites

Las entradas, resultados HTTP, comparación SQL y limpieza se detallan en
[pruebas.md](pruebas.md). Se distingue la integración real previa, confirmada
en la conversación, de la regresión automatizada. En esta actualización
documental no se repitieron las pruebas ni las consultas reales.
No se adjuntan capturas, HAR, logs crudos ni scripts no guardados.
Los IDs son históricos: sus filas fueron eliminadas al finalizar la prueba.

La importación real del ID 30 devolvió HTTP 201 con 24 registros para
2024-04-01; HU-02 manual devolvió aprobado con xm_gene_base v1.0.0. Se comprobó
persistencia y conservación del contenido, y se limpió el ID por ID/source.
La última regresión confirmada fue de 174 pruebas aprobadas, 0 fallidas y
736 aserciones, con typecheck y git diff --check correctos.

Esta evidencia no acredita concurrencia
PostgreSQL específica de importación o del nuevo ruleset, preparación XM, modelos IA ni validación
académica/formal. El documento académico principal no se modifica.
