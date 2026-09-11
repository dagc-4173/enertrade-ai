# HU-03 — Preparar datos para pipeline IA

## Objetivo y alcance

Preparar un dataset de generación validado por HU-02 mediante
`POST /datasets/:id/prepare`, sin cuerpo de solicitud. El perfil implementado es
`generacion_simulada_preparacion_base` v1.0.0, asociado al ruleset
`generacion_simulada_base` v1.0.0. Este expediente cierra técnicamente ese alcance
de backend; no acredita un modelo IA entrenado ni aceptación académica.

| Dimensión | Estado |
| --- | --- |
| Implementación del perfil y persistencia | Implementada |
| Pruebas automatizadas | Probada técnicamente |
| Preparación e idempotencia con PostgreSQL real | Probada técnicamente |
| Concurrencia PostgreSQL posterior a la corrección P2002 | Probada técnicamente, ejecución confirmada por el usuario |
| Integración de HU-03 en frontend | Pendiente; fuera de este cierre |
| Validación académica/formal | Pendiente |

## Implementación verificada

- [Servicio y recuperación de colisión](../../../backend/src/services/dataset-preparation.service.ts).
- [Controlador y respuesta HTTP segura](../../../backend/src/controllers/dataset-preparation.controller.ts).
- [Transformaciones del perfil](../../../backend/src/services/dataset-preparation.profile.ts).
- [Pruebas HU03-01 a HU03-34](../../../backend/src/tests/dataset.test.ts).
- [Esquema Prisma](../../../backend/prisma/schema.prisma).
- [Migración de preparados](../../../backend/prisma/migrations/20260910132541_hu03_prepared_dataset/migration.sql).

El servicio bloquea datasets sin validar o rechazados; comprueba compatibilidad
de tipo, informe y contenido; normaliza fecha a UTC; conserva energia_kwh y el
orden de registros; selecciona zona válida como contexto y registra exclusiones.
Conserva sourceRecordIndex y registra transformaciones. No genera características
adicionales: generatedFeatures permanece vacío.

El artefacto PreparedDataset es independiente del original. La unicidad por
`(sourceDatasetId, profileId, profileVersion)` permite reutilizar el mismo
artefacto sin sobrescribir preparedAt. No se añade un estado preparado al
EnergyDataset ni se modifica su contenido o informe de calidad.

## Criterios y trazabilidad

| Criterio de HU-03 | Evidencia |
| --- | --- |
| Generar representación preparada de datos validados | HU03-01, HU03-08 a HU03-13; preparación PostgreSQL real |
| Usar variables mínimas cuando falta contexto | HU03-02 a HU03-06; integración con advertencia confirmada previamente |
| Impedir preparación de datos no validados | HU03-14; HU03-15 para rechazados |
| Conservar trazabilidad y original | HU03-11/12/24/25/26 |
| Reutilizar artefacto y recuperar colisión esperada | HU03-23/27/31/32; HU03-SEQ-01 y HU03-CONC-02 |
| Propagar errores ajenos y conservar fallo si falta ganador | HU03-28/30/33/34 |

Los resultados, precondiciones y procedencia constan en [pruebas.md](pruebas.md).
Las pruebas con Prisma sustituido no se presentan como integración PostgreSQL.

## Documentación histórica y límites

El [perfil de diseño](perfil-preparacion-generacion-v1.md) y
[ADR-06](../../adr/ADR-06-persistencia-artefactos-preparacion.md) conservan estados
pendientes propios de su fecha de elaboración. Este expediente registra el
estado técnico posterior; no modifica sus decisiones ni el documento académico.

No se afirma cobertura de otros tipos de dataset, procesamiento físico integral,
features para modelos específicos, entrenamiento, despliegue o pruebas de carga.
La vinculación con un objetivo específico académico y la validación formal
permanecen pendientes. Cambios futuros del formato de errores del driver pueden
requerir una nueva captura y regresión; el reconocimiento continúa fail-closed.

La corrección y las pruebas están en el árbol local, sin commit en este paso.
