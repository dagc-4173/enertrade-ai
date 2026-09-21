# C21b - Negociacion backend de precio y cantidad

## Objetivo

C21b permite que los dos participantes de una transaccion energetica simulada negocien manualmente cantidad y precio antes de confirmar. No representa pago, liquidacion, entrega fisica ni operacion comercial real.

## Matching y negociacion

El matching-v1 sigue siendo informativo y solo sugiere una pareja cuando el precio de oferta es menor o igual al maximo de demanda. La negociacion manual es independiente: una transaccion puede iniciarse con un precio acordado aunque no exista match automatico. C21b no modifica el motor de matching.

## Modelo y snapshot

`EnergyTransactionRevision` conserva una revision inmutable por termino propuesto: secuencia, cantidad, precio, total derivado, autor y fecha. La secuencia es unica por transaccion y se consulta en orden ascendente.

`EnergyTransaction` conserva el snapshot vigente de cantidad, precio y total. Cada total se calcula con aritmetica decimal exacta. Una transaccion versionada no admite edicion por `PATCH`; sus cambios se realizan mediante contrapropuesta para no perder historial.

## Flujo de negociacion

- `POST /transactions` exige `quantityKwh` y `pricePerKwh`, crea la revision 1 y deja al iniciador aceptado implicitamente.
- `POST /transactions/:id/counter` exige cantidad y precio. Solo puede ejecutarla la contraparte del autor de la ultima revision.
- La contrapropuesta crea la siguiente secuencia, actualiza el snapshot y reinicia las aceptaciones, dejando aceptado solo al autor del termino vigente.
- La contraparte puede aceptar el ultimo termino; con ambas aceptaciones la transaccion queda `CONFIRMED`.

## Reservas, cancelacion y rechazo

La reserva vigente corresponde al snapshot de una transaccion `PENDING_ACCEPTANCE` o `CONFIRMED`. Al cambiar cantidad se valida el saldo excluyendo la reserva propia; reducirla libera saldo e incrementarla solo se permite si existe disponibilidad. El precio por si solo no altera la reserva.

El iniciador original puede cancelar mientras este pendiente. Solo el receptor del termino vigente puede rechazar. Ambos estados liberan la reserva y preservan el historial de revisiones.

Las cantidades publicadas y sus precios de referencia no se reescriben: el saldo final sigue siendo derivado por C21a. Las filas legacy sin revisiones devuelven historial vacio y no se les fabrica una revision inicial.

## Privacidad

Los DTO de transaccion exponen `role`, `proposalOwnership`, `latestRevisionSequence` y `latestRevisionProposedByRole`, sin IDs internos de participantes. `GET /transactions/:id/revisions` expone solo secuencia, cantidad, precio, total, rol proponente y fecha.

## Concurrencia y limitaciones

La creacion y las contrapropuestas se ejecutan en transacciones PostgreSQL serializables con bloqueos de la transaccion y publicaciones relacionadas. La unicidad `(transactionId, sequence)` refuerza la secuencia de revisiones.

PENDIENTE: prueba real de concurrencia PostgreSQL para counter.

No se aplico la migracion `20260921150000_add_transaction_negotiation_revisions` durante este cierre. Tampoco se incluyen pagos, liquidacion, cambios de frontend, ML ni datasets.

## Pruebas ejecutadas

- `bun test src/tests/energy-transaction.test.ts`: 34 pruebas aprobadas, 116 aserciones.
- `bun test src/tests/matching.test.ts`: 27 pruebas aprobadas, 81 aserciones; incluye oferta 450 y demanda maxima 412.50 sin match automatico.
- `bun run typecheck`: aprobado.