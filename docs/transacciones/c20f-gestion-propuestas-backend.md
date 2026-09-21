# C20f - Gestion backend de propuestas transaccionales

## Alcance

C20f incorpora ownership y gestion backend de propuestas energeticas
simuladas. No incorpora frontend, pagos, liquidacion, matching-v1 ni borrado
fisico de `EnergyTransaction`.

## Modelo y legado

`EnergyTransaction.proposedByUserId` registra el usuario autenticado que creo
cualquier propuesta nueva. La migracion
`20260921110423_add_transaction_proposer_ownership` agrega una columna nullable,
indice y clave foranea sin backfill. Las filas anteriores se mantienen con valor
nulo porque no existe evidencia que permita atribuir su creador. El DTO expone
unicamente `proposalOwnership`: `CREATED_BY_ME`, `RECEIVED` o `LEGACY_UNKNOWN`;
nunca expone el ID del creador.

## API y estados

- `PATCH /transactions/:id` acepta exclusivamente `{ "quantityKwh": number }`.
- El creador puede editar una propuesta `PENDING_ACCEPTANCE`, incluso si una
  parte ya aceptó. Precio, fecha, participantes, estado, trazabilidad e IDs no
  se pueden modificar. Al cambiar la cantidad, ambas marcas de aceptación se
  reinician para que las dos partes acepten nuevamente los términos vigentes.
- La edicion bloquea transaccion, oferta y demanda dentro de una transaccion
  PostgreSQL serializable. Al validar saldo, excluye la reserva previa de la
  propuesta y persiste la cantidad nueva y `totalAmountCop` decimal exacto.
- El creador puede cancelar mientras siga `PENDING_ACCEPTANCE`, incluso tras
  una aceptación individual; se conserva la fila con estado `CANCELLED`,
  liberando la reserva derivada.
- El receptor puede rechazar mientras siga pendiente, incluso si la otra parte
  ya acepto. En propuestas nuevas, el creador no puede rechazar y el receptor
  no puede cancelar.
- `CONFIRMED`, `REJECTED` y `CANCELLED` no admiten PATCH, cancel ni reject.
- Las propuestas legacy no admiten PATCH ni cancelacion basada en creador;
  mantienen aceptacion y rechazo de participantes como comportamiento legado.

## Reserva y concurrencia

La reserva sigue siendo derivada: suma de transacciones
`PENDING_ACCEPTANCE` y `CONFIRMED`. Cambiar 10.000 a 12.000 reserva 12.000;
reducir de 12.000 a 8.000 libera 4.000. La validacion contempla reservas de
otras propuestas y no compara la propuesta contra si misma como duplicado.

## Errores relevantes

`INVALID_TRANSACTION_REQUEST` o `INVALID_TRANSACTION_QUANTITY` responden 400;
ownership de creador/receptor responde 403; ausencia responde 404; estado,
aceptacion, legado o saldo responden 409. Los envelopes conservan `error` y
`message` publicos.

## Corrección C20h: ciclo de vida y DTO

`create`, `findMine`, `findOne`, `edit`, `accept`, `reject` y `cancel` devuelven
el mismo DTO seguro de participante: `role` y `proposalOwnership`, sin IDs de
vendedor, comprador o creador. Esto evita que una operación persistida sea
rechazada por el validador del cliente.

La edición conserva la misma fila, su `createdAt` y procedencia; Prisma
actualiza `updatedAt`. Recalcula `totalAmountCop`, mantiene
`PENDING_ACCEPTANCE` y pone `sellerAcceptedAt` y `buyerAcceptedAt` en `null`.
`CONFIRMED`, `REJECTED`, `CANCELLED` y propuestas legacy permanecen inmutables
para edición/cancelación de creador.

## Evidencia y limitaciones

Las pruebas de servicio cubren creador, receptor, tercero, edicion valida,
saldo de oferta/demanda, otras reservas, reduccion, total COP, aceptacion,
cancelacion, rechazo, confirmacion y legacy. La concurrencia se cubre con el
repositorio en memoria serializado heredado de C20a. No se ejecuto una prueba
de integracion concurrente contra PostgreSQL real; permanece pendiente.
