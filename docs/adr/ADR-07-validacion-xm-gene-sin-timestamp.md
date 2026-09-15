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

La selección se basa en el contrato dataType + columnas. Para dataType generacion,
el contrato simulado (fecha y energia_kwh obligatorias, zona opcional) conserva
prioridad. Si no aplica,
las columnas obligatorias fecha_xm, hora_xm y energia_kwh seleccionan
xm_gene_base v1.0.0. source no interviene: se verifica formato compatible, no
autenticidad de procedencia. Los contratos incompatibles mantienen HTTP 422.

El nuevo evaluador comprueba calendario YYYY-MM-DD (años 0001..9999), periodo
entero 1..24, energía finita e identidad única por fecha/periodo. Produce aprobado
o rechazado, siempre warningCount=0. No exige zona, energía positiva, orden ni
días completos. Los Issues XM tienen un tipo separado; el evaluador anterior
no cambia. La identidad temporal es la pareja (fecha_xm, hora_xm), no un instante.
Se decide deliberadamente NO generar timestamps: la comprobación de calendario
no atribuye una hora, offset, inicio o cierre de intervalo al dato.

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

## Compromisos / deuda

- Perfil de preparación XM pendiente; esta decisión no implementa preparación.
- Verificación oficial de semántica temporal pendiente antes de cualquier
  conversión futura a timestamps.
- La conformidad del formato no acredita autenticidad de source, completitud
  de días ni calidad física integral.
- La importación se implementó en un incremento posterior, reutilizando HU-01;
  no cambia las decisiones temporales de este ADR ni habilita preparación XM.

## Evidencia y límites

Los casos XM de backend/src/tests/dataset.test.ts ejercitan HTTP local con Prisma
sustituido, incluida validación aprobada seguida de rechazo de preparación.
Esas pruebas automatizadas no constituyen integración PostgreSQL ni consulta XM
real. Por separado, la integración HTTP con Express y PostgreSQL reales verificó
los datasets 27 (aprobado), 28 (periodo duplicado) y 29 (fecha/hora inválidas),
la persistencia de los informes y la conservación del contenido original.
HU-03 rechazó el ID 27 con 409 DATASET_VALIDATION_INCONSISTENT, sin crear
PreparedDataset. Los tres datasets temporales fueron eliminados selectivamente.

La procedencia, entradas y resultados se documentan en la
[evidencia técnica XM Gene](../evidencias/hu-02-xm-gene/README.md).
Estado: implementado y probado técnicamente; validación académica/formal pendiente.

Verificación ejecutada: `bun test` — 155 aprobadas, 0 fallidas, 583 aserciones
(35 casos nuevos y las 120 pruebas previas). Typecheck backend mediante
`bun --bun run tsc --noEmit --incremental false -p tsconfig.json`: correcto.

Evidencia posterior: POST /external-data/import consultó XM real y creó el
EnergyDataset 30 mediante HU-01 (HTTP 201, recibido, 24 registros). PostgreSQL
confirmó validatedAt y validationReport nulos antes de la validación manual.
HU-02 devolvió HTTP 200, xm_gene_base v1.0.0, aprobado, sin errores ni advertencias,
canProceed=true; informe persistido y contenido intacto. Se preservaron fecha y
periodos originales sin timestamp ni zona. El ID 30 se eliminó por ID y source
exactos, con cero coincidencias restantes. HU-03 no se ejecutó en esa prueba.

El rechazo de importación DemaSIN produjo HTTP 400 UNSUPPORTED_EXTERNAL_DATASET
sin escrituras. La regresión posterior fue de 174 aprobadas, 0 fallidas y
736 aserciones; typecheck y git diff --check correctos. Son resultados previos
confirmados, no ejecuciones nuevas de este paso documental. Detalles en
[pruebas.md](../evidencias/hu-02-xm-gene/pruebas.md).
