# C20c - Gestion de publicaciones propias

## Alcance

Este incremento incorpora la gestion de ofertas y demandas propias dentro del
mercado energetico simulado. Corresponde al cambio autorizado de Trabajo de
Grado II: **Gestionar publicaciones energeticas propias**. Su formalizacion en
el backlog permanece pendiente; no se renumeran historias de usuario.

No incorpora pagos, pasarela, checkout, tarjetas, liquidacion ni estados de
pago.

## Comportamiento implementado

- Una publicacion propia `ACTIVE` puede actualizar cantidad, precio y fecha de
  entrega mediante `PATCH /offers/:id` o `PATCH /demands/:id`.
- Una publicacion propia `ACTIVE` puede cancelarse logicamente mediante
  `POST /offers/:id/cancel` o `POST /demands/:id/cancel`. El estado nuevo es
  `CANCELLED`; no se elimina el registro.
- Solo el propietario puede gestionar la publicacion. Un recurso ajeno o
  inexistente responde como no encontrado.
- Las publicaciones `FULFILLED` y `CANCELLED` no se pueden editar ni cancelar.
- Cualquier transaccion vinculada `PENDING_ACCEPTANCE` o `CONFIRMED` bloquea
  tanto edicion como cancelacion. Las transacciones rechazadas o canceladas no
  bloquean.
- Las transacciones conservan su cantidad, precio, total, fecha y estado; la
  edicion de una publicacion no modifica ese historial ni snapshots de matching.

## Compatibilidad transaccional

El Mercado activo conserva el boton de propuesta para cada publicacion propia
activa y explica si cantidad, fecha y precio son compatibles. Cuando no lo son,
el boton queda deshabilitado con su causa visible. Por ejemplo, para oferta de
21.000 kWh a 950,00 COP/kWh y demanda de 21.000 kWh con maximo de 900,00
COP/kWh para la misma fecha, la pantalla informa que cantidad y fecha son
compatibles y que el precio no lo es: la oferta es 950,00 COP/kWh y la demanda
acepta maximo 900,00 COP/kWh. Al editar la oferta a 900,00 COP/kWh, el criterio
de precio pasa a compatible.

La API de creacion de transacciones sigue siendo la autoridad final sobre
saldo disponible y demas reglas de negocio.

## Evidencia ejecutada

- Migracion Prisma aplicada: `20260921095752_add_cancelled_market_status`.
- `backend`: `bun test src/tests/energy-marketplace.test.ts` - 19 pruebas,
  0 fallos.
- `frontend`: `bun test` - 78 pruebas, 0 fallos.
- `frontend`: `bun run lint` - correcto.
- `frontend`: `bun run build` - correcto.

La prueba manual con dos cuentas sigue pendiente y no se registra como
ejecutada.