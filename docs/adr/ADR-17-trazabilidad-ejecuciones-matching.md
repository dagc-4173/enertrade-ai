# ADR-17 — Trazabilidad de ejecuciones de emparejamiento

**Estado:** Aceptado para HU-11.

## Contexto

HU-10 calcula sugerencias deterministas de emparejamiento a partir de ofertas y demandas activas. HU-11 requiere conservar la trazabilidad de cada simulacion sin convertir la sugerencia en una transaccion comercial.

El resultado puede incluir multiples ofertas, demandas, coincidencias completas, parciales o sin coincidencia. Una misma llamada representa una sola simulacion. La traza de pronostico de precio existente usa una ejecucion bifasica, UUID, snapshots JSON y estados separados del resultado tecnico.

## Alternativas

### Una fila por ejecucion con snapshots JSON

Conserva el contexto exacto usado por HU-10 y el resultado completo con bajo impacto de esquema. No crea relaciones hijas ni modifica publicaciones del Marketplace.

### Una fila por pareja oferta-demanda o por demanda

Fragmenta una simulacion que puede tener varias asignaciones y dificulta conservar `summary`, `warnings` y demandas `NO_MATCH` como una sola salida.

### Referencias Prisma y tablas hijas

Aporta integridad relacional, pero requiere entidades adicionales y no conserva por si sola los valores historicos usados por el algoritmo. Excede el alcance v1.

## Decision

Se adopta una fila `MatchingExecution` por cada `POST /matches/suggest`.

La ejecucion crea un UUID en la aplicacion e intenta persistir `pending` antes de leer las publicaciones. Tras calcular HU-10, persiste snapshots JSON de entrada y resultado y actualiza a `succeeded`. Si el calculo falla, intenta actualizar a `failed` con un codigo sanitizado.

`executionStatus` (`pending`, `succeeded`, `failed`) representa el ciclo de la traza. `matchingStatus` (`matched`, `partial`, `no_matches`) representa el resultado de negocio. No se confunden: `no_matches` es una ejecucion satisfactoria.

`inputSnapshot` conserva solo ID, cantidades y precios como strings, fecha de entrega y fecha de creacion de ofertas y demandas activas usadas. `resultSnapshot` conserva exactamente el contrato HU-10: `status`, `matches`, `demands`, `summary` y `warnings`. `criteriaSnapshot` resume `matching-v1`; no replica este ADR.

La persistencia es no bloqueante para un resultado tecnico ya calculado. Si el inicio o cierre de traza falla, la respuesta conserva HU-10 y expone `trace.persistence = failed`; el UUID se devuelve incluso si no se logro crear la fila. No hay transacciones de energia, pagos, reservas ni cambios en `EnergyOffer` o `EnergyDemand`.

## Justificacion

Una fila por ejecucion satisface los criterios HU-11 sobre ofertas, demandas, criterios, fecha, resultado y estado. Los snapshots hacen reproducible la simulacion ante cambios futuros de publicaciones y preservan precision decimal sin conversion a `Number`.

El ciclo bifasico es consistente con HU-09: un fallo de auditoria no debe ocultar el resultado tecnico. No se usa `$transaction` porque acoplaria el resultado de matching al exito de la auditoria.

## Consecuencias

- Cada intento tiene UUID independiente, incluso con entrada identica.
- Puede quedar una fila `pending` si falla el cierre de traza.
- No hay consulta historica en HU-11 v1; puede evaluarse en una historia posterior.
- No se registra `requestedByUserId`: el backend autentica usuarios, pero no implementa RBAC ni puede afirmar el rol administrador.
- Los indices se limitan a `createdAt` y `executionStatus`.

## Trabajo futuro

Evaluar RBAC, consulta historica, recuperacion de ejecuciones `pending`, relaciones vivas o tablas hijas si existe un caso de consulta demostrado. Ninguno de estos puntos forma parte de HU-11 v1.
