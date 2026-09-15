# ADR-07 — Validación XM Gene sin inferir timestamps

**Estado:** Aceptado para este incremento de HU-02.

## Contexto

Gene conserva fecha calendario, periodo 1..24 y energía kWh. No hay evidencia
suficiente para convertir el periodo en un instante. El ruleset simulado exige
timestamps y permanece intacto. HU-01 admite columnas genéricas.

## Alternativas consideradas

- Inferir timestamps: descartado por semántica no demostrada.
- Modificar el ruleset simulado: descartado para preservar su contrato.
- Ruleset separado y selección por columnas: elegido, sin migraciones.

## Decisión

Para dataType generacion, el contrato simulado conserva prioridad. Si no aplica,
las columnas obligatorias fecha_xm, hora_xm y energia_kwh seleccionan
xm_gene_base v1.0.0. source no interviene: se verifica formato compatible, no
autenticidad de procedencia. Los contratos incompatibles mantienen HTTP 422.

El nuevo evaluador comprueba calendario YYYY-MM-DD (años 0001..9999), periodo
entero 1..24, energía finita e identidad única por fecha/periodo. Produce aprobado
o rechazado, siempre warningCount=0. No exige zona, energía positiva, orden ni
días completos. Los Issues XM tienen un tipo separado; el evaluador anterior
no cambia. La comprobación de calendario no atribuye un instante al dato.

El guard estructural existente conserva HTTP 409 para registros vacíos, campos
obligatorios ausentes y contenido incompatible, incluidos números no finitos.
El evaluador también rechaza números no finitos si se invoca directamente.
Se conserva la escritura atómica condicionada por status=recibido, el envelope
y la prohibición de sobrescribir validaciones completadas.

## Justificación y consecuencias

Se reutiliza la orquestación de HU-02 sin duplicar persistencia ni modificar
HU-01, Prisma o el endpoint. Un dataset que satisface ambos contratos sigue
evaluándose como simulado, incluso si sus columnas XM adicionales son inválidas.

canProceed expresa ausencia de rechazo de calidad, no disponibilidad de un
perfil de preparación. HU-03 permanece intacta: un informe xm_gene_base recibe
HTTP 409 DATASET_VALIDATION_INCONSISTENT antes de acceder a PreparedDataset.
La preparación XM y la semántica temporal oficial siguen pendientes.

## Evidencia y límites

Los casos XM de backend/src/tests/dataset.test.ts ejercitan HTTP local con Prisma
sustituido, incluida validación aprobada seguida de rechazo de preparación.
No constituyen pruebas contra PostgreSQL/XM reales ni validación académica.
No se implementa importación en este incremento.

Verificación ejecutada: `bun test` — 155 aprobadas, 0 fallidas, 583 aserciones
(35 casos nuevos y las 120 pruebas previas). Typecheck backend mediante
`bun --bun run tsc --noEmit --incremental false -p tsconfig.json`: correcto.
