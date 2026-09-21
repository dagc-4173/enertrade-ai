# ADR-24 - Transacciones energeticas simuladas, reservas y concurrencia

**Estado:** Aceptado para C20a.

## Contexto

HU-10 y HU-11 producen sugerencias y trazas, pero no crean operaciones comerciales ni modifican publicaciones. El cambio de alcance TG-II autorizado incorpora un nucleo de transacciones energeticas simuladas, sin pagos, liquidacion financiera ni entrega fisica.

## Decision

Se incorpora `EnergyTransaction` con estados `PENDING_ACCEPTANCE`, `CONFIRMED`, `REJECTED` y `CANCELLED`.

- Crear una propuesta reserva la cantidad solicitada mientras esta pendiente.
- El saldo disponible se calcula como cantidad original menos transacciones `PENDING_ACCEPTANCE` y `CONFIRMED`.
- `REJECTED` y `CANCELLED` liberan la reserva porque no participan en el calculo.
- Cada participante acepta por separado. Cuando ambas marcas existen, la transaccion pasa a `CONFIRMED` y registra `confirmedAt`.
- Una publicacion se marca `FULFILLED` solo cuando la suma confirmada cubre su cantidad original; se conserva la cantidad original para historial.
- El precio de cierre es `EnergyOffer.pricePerKwh`. Es coherente con la compatibilidad vigente `offer.pricePerKwh <= demand.maxPricePerKwh`; no se introduce negociacion dinamica.
- `totalAmountCop` se deriva por multiplicacion decimal exacta de cantidad y precio, sin `Number` ni formato localizado.

La creacion se ejecuta en una transaccion PostgreSQL serializable. Bloquea primero la oferta y despues la demanda con `SELECT ... FOR UPDATE`, calcula saldos y crea la reserva dentro de la misma transaccion. La secuencia de bloqueo estable evita doble asignacion para las mismas publicaciones.

## Alternativas descartadas

**Reservar al confirmar:** permite propuestas simultaneas que prometen la misma energia y desplaza el conflicto a la segunda aceptacion.

**Solo find/create sin bloqueo:** no protege contra dos solicitudes concurrentes que lean el mismo saldo.

**Precio negociado o pago simulado:** no existe una regla de negocio ni alcance autorizado para ello.

## Consecuencias

- Una propuesta pendiente puede impedir temporalmente otra sobre el mismo saldo.
- No existe expiracion automatica de reservas en C20a; un participante debe rechazar o cancelar mientras este pendiente.
- Las sugerencias de matching siguen siendo de solo lectura y pueden no reflejar reservas recientes; la validacion definitiva ocurre al crear la propuesta.
- Un conflicto de serializacion de PostgreSQL se rechaza sin crear doble reserva. La politica de reintento se deja para una fase posterior si se observa contention real.
- La relacion opcional con `MatchingExecution` conserva la procedencia cuando la propuesta aporta un UUID valido; C20b debe enviar ese dato solo al seleccionar una sugerencia correspondiente.
