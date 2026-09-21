# ADR-24 - Transacciones energeticas simuladas, reservas y concurrencia

**Estado:** Aceptado para C20a.

**Extensión C20f:** Aceptada para ownership y mutabilidad de propuestas.

**Extensión C21a:** Aceptada para saldos parciales acumulativos.

**Extensión C21a.2:** Aceptada para vencimiento de publicaciones y recálculo de matching.

**Extensión C21a.3:** Aceptada para visibilidad de saldos propios y edición acotada.

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

## Extensión C20f: ownership y mutabilidad

Cada propuesta nueva registra `proposedByUserId` desde la sesión autenticada;
el cliente no puede enviarlo. El campo es nullable exclusivamente para preservar
filas previas a C20f: no existe evidencia histórica suficiente para atribuirles
un creador, por lo que se clasifican como `LEGACY_UNKNOWN` y no se pueden editar
ni cancelar mediante la regla de creador.

El creador puede editar solamente `quantityKwh` mientras la propuesta esté
`PENDING_ACCEPTANCE`, aun cuando exista una aceptación individual. La edición
se ejecuta en la misma transacción serializable que bloquea transacción, oferta
y demanda; al validar saldo excluye la reserva actual y recalcula el total con
aritmética decimal exacta. Como los términos cambian, reinicia ambas
aceptaciones para requerir consentimiento de nuevo. No modifica precio, fecha,
participantes, estado ni procedencia.

El creador puede cancelar mientras siga pendiente, incluso después de una
aceptación individual. El receptor puede rechazar mientras siga pendiente,
incluso después de la aceptación de la otra parte. En una propuesta nueva, el
creador no puede rechazar y el receptor no puede cancelar. `CONFIRMED`,
`REJECTED` y `CANCELLED` son inmutables.

Todos los comandos mutables de transacción devuelven el DTO seguro de
participante, con `role` y `proposalOwnership`, sin IDs internos. Esto mantiene
un contrato uniforme con creación y consultas.

Las pruebas unitarias conservan la simulación serializada heredada de C20a. La
prueba de integración de concurrencia contra PostgreSQL real permanece
pendiente; no se presenta como evidencia ejecutada.

## Extensión C21a: saldos parciales acumulativos

`EnergyOffer.quantityKwh` y `EnergyDemand.quantityKwh` son cantidades
originales inmutables para trazabilidad. El saldo disponible no se persiste ni
reduce físicamente: se deriva como cantidad original menos la suma de
transacciones `PENDING_ACCEPTANCE` y `CONFIRMED` asociadas a la publicación.

Por tanto, una oferta puede cubrir varias demandas y una demanda puede recibir
cobertura de varias ofertas, siempre que cada nueva propuesta no exceda ambos
saldos derivados. `REJECTED` y `CANCELLED` liberan saldo; no existe
sobreasignación porque la validación y creación suceden bajo bloqueos de oferta
y demanda en una transacción serializable.

Una publicación se conserva `ACTIVE` mientras su suma `CONFIRMED` sea menor
que la cantidad original, aunque las reservas pendientes dejen saldo disponible
cero y la oculten temporalmente del mercado. Solo pasa a `FULFILLED` cuando la
suma confirmada es mayor o igual que su cantidad original. Las reservas
pendientes no completan una publicación.

El Marketplace presenta el saldo externo derivado y permite proponer hasta el
mínimo entre ambos saldos mostrados en la interacción. Esta extensión no añade
pagos ni contrapropuestas de precio y no modifica el matching informativo
existente.

## Extensión C21a.2: publicaciones vencidas

Se conserva una publicación vencida como historia, pero deja de ser negociable:
el enum de mercado incorpora `EXPIRED` mediante migración. La transición es
perezosa y centralizada al consultar publicaciones, mercado o entradas de
matching; actualiza exclusivamente `ACTIVE` con `deliveryDate` estrictamente
anterior a la fecha calendario de negocio en `America/Bogota`.

`EXPIRED` no se devuelve desde el mercado activo ni se entrega a matching. El
propietario sí la conserva en `/offers/mine` o `/demands/mine`, pero no puede
editarla ni cancelarla. Las creaciones y ediciones con fecha pasada se rechazan;
una propuesta nueva detecta la expiración dentro de su transacción bloqueada y
retorna `PUBLICATION_EXPIRED`.

Una propuesta pendiente preexistente no se modifica automáticamente si una de
sus publicaciones vence. Su trazabilidad se conserva y no se establece una
política de cancelación, rechazo o liberación automática sin refinamiento de
negocio posterior.

## Extensión C21a.3: saldo visible de publicaciones propias

`quantityKwh` conserva el término publicado original y nunca se sobrescribe por
el saldo operativo. `/offers/mine` y `/demands/mine` devuelven además
`confirmedQuantityKwh`, `reservedQuantityKwh` y `availableQuantityKwh`,
derivados respectivamente de transacciones `CONFIRMED`,
`PENDING_ACCEPTANCE` y de la resta no negativa contra `quantityKwh`.
`REJECTED` y `CANCELLED` no participan en esos agregados.

La interfaz consume esos saldos del backend en cada carga o refresh y conserva
`quantityKwh` al editar. Una publicación `ACTIVE` puede modificar su término
original, pero no por debajo de la suma confirmada y reservada; la violación se
rechaza como `PUBLICATION_QUANTITY_BELOW_COMMITTED`. La cancelación permanece
bloqueada cuando hay reserva o confirmación. Esta decisión permite ampliar o
reducir capacidad no comprometida sin alterar el historial de transacciones.
