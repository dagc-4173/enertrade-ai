# HU-02 — Validar calidad de datos energéticos

## Alcance implementado

POST /datasets/:id/validate, sin body, utilizando internamente generacion_simulada_base v1.0.0. Aplica únicamente a datasets de tipo generacion compatibles con la referencia simulada.

| Dimensión | Estado |
| --- | --- |
| Implementación del ruleset v1 | Implementado |
| Pruebas automatizadas | Probado |
| Integración PostgreSQL | Probado |
| Concurrencia PostgreSQL real | Probado |
| Validación formal/académica | Pendiente |

El resultado significa únicamente:

> Conformidad con generacion_simulada_base v1.0.0

No significa calidad energética integral, validación física, cobertura de rangos, validación de periodicidad ni certificación de unidades o fuente.

## Implementación y decisiones

- [app.ts](../../../backend/src/app.ts)
- [dataset-validation.controller.ts](../../../backend/src/controllers/dataset-validation.controller.ts)
- [dataset-validation.service.ts](../../../backend/src/services/dataset-validation.service.ts)
- [dataset-validation.rules.ts](../../../backend/src/services/dataset-validation.rules.ts)
- [dataset.test.ts](../../../backend/src/tests/dataset.test.ts)
- [schema.prisma](../../../backend/prisma/schema.prisma)
- [Migración HU-02](../../../backend/prisma/migrations/20260910021955_hu02_dataset_validation/migration.sql)
- [ADR-05](../../adr/ADR-05-persistencia-concurrencia-validacion-datasets.md)

Reglas implementadas:

- CRITICAL_VALUE_MISSING
- CRITICAL_TYPE_MISMATCH
- INVALID_TIMESTAMP
- DUPLICATE_TEMPORAL_IDENTITY
- OPTIONAL_VALUE_MISSING
- OPTIONAL_TYPE_MISMATCH

Estados: recibido, aprobado, advertencia y rechazado. content y pendingOptionalFields permanecen intactos. La persistencia protege la escritura mediante updateMany condicionado por id y status=recibido. Una segunda validación devuelve conflicto y no sobrescribe. Estado, fecha e informe se escriben conjuntamente.

## Trazabilidad

Gestión de datos energéticos → HU-02 → Sprint 1 → generacion_simulada_base v1.0.0 → implementación enlazada → HU02-01 a HU02-21 → integración PostgreSQL → concurrencia real → [pruebas.md](pruebas.md).

- [Historias de Usuario.docx](../../contexto/Historias%20de%20Usuario.docx): módulo, HU-02, Sprint 1 y escenarios de calidad.
- [Trabajo de grado II.docx](../../contexto/Trabajo%20de%20grado%20II.docx): product backlog, HU-02 en S1.
- Objetivo específico exacto: **Pendiente de vinculación documental**.

| Criterio | Evidencia |
| --- | --- |
| Dataset conforme a reglas | HU02-01 y HU02-CONC-01 |
| Problemas no críticos con advertencia | HU02-02/03 y HU02-INT-01 |
| Problemas críticos rechazados y registrados | HU02-04/05/08/09/11 y HU02-REJ-01 |
| Resultado único y sin sobrescritura | HU02-16/18/19, HU02-SEQ-01 y HU02-CONC-01 |

El bloqueo se expresa mediante canProceed=false; no acredita ejecución de HU-03. Rangos, periodicidad, catálogo de zonas y verificación independiente de unidades están fuera de v1.

## Documentos y procedencia

- [Dataset de referencia](dataset-referencia.md)
- [Ruleset aprobado](ruleset-generacion-simulada-v1.md)
- [Pruebas verificadas](pruebas.md)
- [Deuda técnica](deuda-tecnica.md)
- [Uso de IA](uso-ia.md)

Los documentos de referencia y ruleset se conservan sin modificaciones como línea base de diseño. Sus declaraciones de implementación/pruebas pendientes corresponden a aquel momento; este README registra la evidencia técnica posterior sin alterar las reglas ni atribuir validación académica. Lo mismo aplica al estado histórico de ADR-05.

Este expediente transcribe resultados verificados previamente; no representa nuevas ejecuciones ni contiene credenciales.
