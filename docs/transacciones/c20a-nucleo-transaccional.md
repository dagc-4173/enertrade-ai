# C20a - Nucleo de transacciones energeticas simuladas

## Motivacion y alcance

Este cambio de alcance TG-II autorizado agrega el backend para registrar propuestas de intercambio energetico simulado. No modifica HU-10 ni HU-11: matching continua siendo una sugerencia determinista y no cambia publicaciones automaticamente.

Historia provisional, pendiente de formalizacion en el backlog: "Como usuario participante del mercado, quiero aceptar y confirmar una propuesta de intercambio energetico, para registrar una transaccion simulada trazable."

## Fuera de alcance

- Pasarela de pagos, cobro, transferencia bancaria, liquidacion externa, blockchain y facturacion fiscal.
- Estados `PAID`, `SETTLED` o `PAYMENT_PENDING`.
- Entrega fisica de energia.
- Frontend de transacciones: `Transactions.tsx` conserva su estado de prototipo para C20b.

Confirmar significa solamente "transaccion energetica simulada registrada". No afirma pago ni entrega.

## Modelo y estados

`EnergyTransaction` conserva oferta, demanda, vendedor, comprador, cantidad, precio de oferta, total exacto COP, fecha de entrega, aceptaciones, estado y timestamps. Puede relacionarse opcionalmente con `MatchingExecution`.

Estados permitidos:

```text
PENDING_ACCEPTANCE --ambas aceptaciones--> CONFIRMED
PENDING_ACCEPTANCE --reject--> REJECTED
PENDING_ACCEPTANCE --cancel--> CANCELLED
```

`CONFIRMED`, `REJECTED` y `CANCELLED` son finales. Solo participantes pueden aceptar, rechazar o cancelar; cancelar y rechazar se permiten exclusivamente mientras esta pendiente.

## Creacion, precio y saldos

`POST /transactions` acepta `offerId`, `demandId`, `quantityKwh` y, opcionalmente, `matchingExecutionId`. No acepta usuarios, precio, total o estado: todos son derivados por el backend.

La propuesta requiere publicaciones `ACTIVE`, usuarios distintos, fecha igual, precio de oferta no mayor que el maximo de demanda, cantidad positiva con hasta dos decimales y actor participante. El precio de transaccion es el de la oferta. `totalAmountCop = quantityKwh * pricePerKwh` se calcula como decimal exacto y se persiste sin localizacion.

Una propuesta pendiente reserva cantidad. El saldo es cantidad original menos reservas pendientes y confirmadas. La reserva se libera al rechazar o cancelar. Al confirmar, si el acumulado confirmado cubre una publicacion, se marca `FULFILLED`; no se borra ni sustituye la cantidad original.

## Concurrencia e idempotencia

La creacion usa una transaccion PostgreSQL serializable y bloqueos `FOR UPDATE` sobre oferta y demanda antes de calcular saldos. Dos propuestas concurrentes de 8.000 sobre una oferta de 10.000 no pueden reservar ambas cantidades.

Se rechaza una propuesta pendiente equivalente para la misma oferta, demanda y cantidad (`DUPLICATE_ACTIVE_PROPOSAL`). Una propuesta posterior es valida despues de `REJECTED` o `CANCELLED` si existe saldo. La aceptacion repetida por el mismo participante mientras la transaccion sigue pendiente es idempotente.

## API y privacidad

- `POST /transactions`: crea propuesta autenticada.
- `POST /transactions/:id/accept`: registra aceptacion propia y confirma al completarse ambas.
- `POST /transactions/:id/reject`: rechaza una propuesta pendiente.
- `POST /transactions/:id/cancel`: cancela una propuesta pendiente.
- `GET /transactions/mine?status=`: lista solo compras o ventas propias.
- `GET /transactions/:id`: detalle solo para participantes; un tercero recibe `404`.

Los DTO no exponen `sellerUserId`, `buyerUserId`, correo, contrasenas, hashes, tokens ni sesiones.

## Evidencia automatizada y limitaciones

`energy-transaction.test.ts` cubre creacion valida, usuario igual, publicaciones inexistentes, fecha/precio incompatibles, cantidades invalidas o sin saldo, actor ajeno, aceptaciones, confirmacion, rechazo, cancelacion, liberacion, parcial, total COP, privacidad, trazabilidad opcional y consulta privada.

La prueba de concurrencia usa un repositorio en memoria serializado y demuestra la regla de negocio. No es una prueba de integracion contra PostgreSQL real; esa evidencia queda pendiente antes de afirmar validacion de concurrencia en infraestructura real.

No se implementan endpoints globales publicos de Marketplace en C20a. Se difieren a C20b para evitar ampliar esta fase.

## Continuidad C20b

C20b implementa el frontend transaccional y los endpoints autenticados de mercado activo como cambio de alcance TG-II autorizado por el estudiante. La historia transaccional mantiene caracter provisional y pendiente de formalizacion formal en backlog. Ver `c20b-frontend-transaccional.md`.
