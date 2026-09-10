# HU-01 — Registrar dataset energético base

## Alcance y estado

Registro mediante `POST /datasets` con solicitud JSON. La evidencia corresponde al backend mínimo aprobado; no acredita interfaz, procesamiento de calidad, ML ni conexión con medidores físicos.

| Dimensión | Estado |
| --- | --- |
| Implementación | Implementado |
| Pruebas automatizadas | Probado |
| Integración PostgreSQL | Probado |
| Validación formal/académica | Pendiente |

Tecnologías verificadas: Bun 1.3.13, Prisma 7.8.0 y PostgreSQL.

Este expediente documenta ejecuciones anteriores verificadas en la sesión de trabajo. No representa una nueva ejecución de pruebas ni una validación académica.

## Implementación y persistencia

- [Aplicación y montaje de ruta](../../../backend/src/app.ts).
- [Controlador](../../../backend/src/controllers/dataset.controller.ts).
- [Servicio](../../../backend/src/services/dataset.service.ts).
- [Cliente de persistencia compartido](../../../backend/src/lib/prisma.ts).
- [Pruebas automatizadas](../../../backend/src/tests/dataset.test.ts).
- [Esquema Prisma](../../../backend/prisma/schema.prisma).
- [Migración aplicada: 20260909211635_init_energy_dataset](../../../backend/prisma/migrations/20260909211635_init_energy_dataset/migration.sql).

Modelo aprobado:

```prisma
model EnergyDataset {
  id                    Int                 @id @default(autoincrement())
  source                String
  dataType              EnergyDatasetType
  uploadedAt            DateTime            @default(now()) @db.Timestamptz(3)
  status                EnergyDatasetStatus @default(recibido)
  content               Json
  pendingOptionalFields Json
}
```

Tipos admitidos: `generacion`, `consumo`, `oferta`, `demanda`, `precios`, `transacciones_simuladas`. Estado inicial: `recibido`.

La solicitud proporciona fuente, tipo, columnas y registros. `content` conserva `columns` y `records`. El servicio omite `uploadedAt` y `status` al crear la fila para utilizar los defaults. La respuesta HTTP 201 incluye metadatos, cantidad de registros y pendientes; no devuelve el contenido completo.

`pendingOptionalFields` registra `recordIndex` (desde cero), `field` y `reason: "empty_optional_field"` para opcionales ausentes, nulos, vacíos o compuestos solo por espacios. Cero y false no son pendientes. Los valores presentes en columnas obligatorias se conservan sin validación semántica de calidad.

## Criterios y evidencia

| Criterio de HU-01 | Evidencia | Estado |
| --- | --- | --- |
| Dataset válido registrado con estado recibido | HU01-01, HU01-08 y HU01-INT-01 | Probado |
| Opcionales vacíos permitidos y señalados como pendientes | HU01-02, HU01-03 y HU01-INT-01 (null) | Probado |
| Formato inesperado rechazado con motivo | HU01-04, HU01-05 y HU01-06; persistencia sustituida | Probado |
| Conservación de fuente, fecha, tipo y estado | HU01-08 y comparación real HU01-INT-01 | Probado |

Los casos y el alcance de cada comprobación están en [pruebas.md](pruebas.md).

## Trazabilidad documental

Fuentes consultadas:
- [Historias de Usuario.docx](../../contexto/Historias%20de%20Usuario.docx): HU-01, “Gestión de datos energéticos”, “Registrar dataset energético base”, operario / analista energético, prioridad alta, Sprint 1. Define los tres escenarios anteriores y los metadatos mínimos.
- [Trabajo de grado II.docx](../../contexto/Trabajo%20de%20grado%20II.docx): sección 7.2, Product backlog, fila HU-01 con el mismo nombre, S1 y criterio resumido de registro y almacenamiento o disponibilidad del dataset.

La fila del informe académico todavía indica “Pendiente”; este expediente registra la evidencia técnica posterior sin modificar aquel documento ni atribuirle aceptación formal.

Vínculo con un objetivo específico: **Pendiente de vinculación documental**. La sección 5.2 contiene objetivos sobre requerimientos, diseño, codificación del pipeline y evaluación, pero no se encontró una asignación inequívoca HU-01 → objetivo específico. La tabla de resultados por objetivo conserva marcadores de plantilla. No se adjudica un código OE ni cumplimiento global de un objetivo.

## Documentos relacionados

- [Pruebas](pruebas.md)
- [Deuda técnica](deuda-tecnica.md)
- [Uso de IA](uso-ia.md)
