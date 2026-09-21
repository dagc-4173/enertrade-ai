# C21a - Saldos parciales reales y múltiples transacciones

## Alcance

Este incremento permite que una publicación activa participe en varias
propuestas y confirmaciones parciales sin modificar su cantidad original. Se
relaciona con el núcleo transaccional simulado y es una propuesta provisional
de backlog; no asigna ni renumera una HU académica existente.

## Regla implementada

- Cantidad original: `EnergyOffer.quantityKwh` y `EnergyDemand.quantityKwh`.
- Saldo disponible: cantidad original menos transacciones `PENDING_ACCEPTANCE`
  y `CONFIRMED` de esa publicación.
- `REJECTED` y `CANCELLED` no reservan saldo.
- Cada propuesta valida cantidad positiva y que no exceda el saldo de oferta ni
  el saldo de demanda dentro de la transacción serializable bloqueada.
- La publicación permanece `ACTIVE` mientras lo confirmado sea inferior a su
  cantidad original. Solo queda `FULFILLED` con cobertura confirmada acumulada
  mayor o igual a la original.

Una reserva pendiente puede agotar temporalmente el saldo mostrado sin cambiar
el estado a `FULFILLED`. Al cancelarla o rechazarla, el saldo vuelve a quedar
disponible para nuevas propuestas.

## Interfaz

El mercado externo expone `availableQuantityKwh`, calculado en backend. Para
las publicaciones propias, los endpoints `/offers/mine` y `/demands/mine`
exponen `quantityKwh`, `confirmedQuantityKwh`, `reservedQuantityKwh` y
`availableQuantityKwh`, sin `userId`. `quantityKwh` conserva la cantidad
original de la publicación; `availableQuantityKwh` representa el saldo
negociable actual. Por ejemplo, una oferta original de `100000` con una
transacción confirmada por `50000` informa original `100000`, confirmada
`50000`, reservada `0` y disponible `50000`.

La compatibilidad ya no exige cantidades originales iguales: para fecha y
precio compatibles, la interfaz indica la cantidad negociable hasta el mínimo
de ambos saldos y permite crear una propuesta parcial dentro de ese límite.
El Marketplace usa los saldos del DTO propio como fuente de verdad al entrar o
refrescar, no un saldo cacheado derivado en el cliente.

En las tablas propias, ofertas muestran como dato principal los kWh
`disponibles` y demandas los kWh `pendientes`; la misma celda muestra la
cantidad publicada o solicitada, la confirmada y, si existe, la reservada.
`FULFILLED` se muestra como `Completada`; una publicación `ACTIVE` con saldo
cero por reserva se mantiene `Activa`, no completada.

Editar precarga `quantityKwh`, no `availableQuantityKwh`. Una publicación
`ACTIVE` puede cambiar su cantidad original mientras no sea menor que
`confirmedQuantityKwh + reservedQuantityKwh`; de lo contrario el backend
retorna `409 PUBLICATION_QUANTITY_BELOW_COMMITTED`. Aumentar cantidad amplía el
saldo derivado y reducir hasta ese límite conserva las transacciones previas.
Cancelar continúa bloqueado con reservas o confirmaciones.

## Extensión C21a.2: vencimiento y recálculo

Se agrega el estado persistente `EXPIRED` para ofertas y demandas. Una
publicación pasa de `ACTIVE` a `EXPIRED` solo cuando su fecha de entrega es
estrictamente menor que la fecha de negocio de Colombia (`America/Bogota`). Una
fecha igual a hoy permanece activa durante ese día. La conversión se hace desde
la fecha calendario `YYYY-MM-DD`, no comparando timestamps de entrega.

La expiración es perezosa: una operación central se ejecuta al consultar las
publicaciones propias, el mercado externo o antes de leer entradas para
matching. No hay cron. Las filas `FULFILLED` y `CANCELLED` no cambian, y las
filas vencidas se conservan en el historial de su propietario con estado
`Vencida`; no se muestran en el mercado ni participan en matching.

Crear o editar una publicación con fecha anterior a la fecha de negocio se
rechaza con `400 DELIVERY_DATE_PAST`. Una propuesta nueva que encuentra una
oferta o demanda vencida bajo el bloqueo transaccional se rechaza con
`409 PUBLICATION_EXPIRED`. Una propuesta `PENDING_ACCEPTANCE` existente no se
cancela ni modifica automáticamente al vencer su publicación: conserva la
trazabilidad y su resolución futura requiere una regla de negocio explícita.

Después de crear, editar o cancelar una publicación, o crear una propuesta desde
Marketplace, el cliente invalida las sugerencias mostradas. Si el usuario ya
había solicitado matching, refresca publicaciones y solicita el matching de
nuevo; durante ese proceso muestra `Actualizando emparejamientos…` y no conserva
el resultado anterior. Si nunca se solicitó matching, mantiene el estado idle.

Las acciones de publicaciones propias usan botones de igual tamaño (`Editar` y
`Cancelar`) en una columna sticky a la derecha de la tabla, apilados en viewport
estrecho. El scroll horizontal se conserva para el resto de columnas.

## Límites conservados

- No hay pagos, liquidación ni entrega física.
- No hay contrapropuestas de precio.
- No se modificó el algoritmo de asignación ni se implementó matching
  multi-oferta nuevo; C21a.2 solo excluye publicaciones vencidas antes de su
  lectura.
- La edición de una publicación activa se permite únicamente sin reducir su
  cantidad bajo la suma confirmada y reservada; la cancelación sigue bloqueada
  con reserva pendiente o transacción confirmada.
- C21a.2 incorpora una única migración Prisma
  `20260921130000_add_expired_publication_status`, con
  `ALTER TYPE "EnergyMarketStatus" ADD VALUE 'EXPIRED'`. No se aplicó mediante
  `db push` durante este incremento.

## Evidencia automatizada

- `backend/src/tests/energy-transaction.test.ts`: confirma cobertura parcial,
  acumulación, liberación por cancelación y prevención de sobreasignación.
- `backend/src/tests/market-balance.test.ts`: verifica saldo de mercado
  `30000 - 10000 - 5000 = 15000`, exclusión de saldos cero y que estados
  cancelado/rechazado no descuentan.
- `frontend/tests/marketplace.test.tsx`: verifica que una demanda de `30000`
  frente a una oferta disponible de `8000` sigue siendo negociable hasta
  `8000`, el contrato de `EXPIRED`, la estructura de acciones responsive y el
  flujo de invalidación/rematch.
- `backend/src/tests/publication-expiration.test.ts`,
  `market-balance.test.ts` y `matching-trace.test.ts`: cubren fecha pasada, hoy,
  futuro, historial, exclusión de mercado y expiración previa a matching.
- `backend/src/tests/matching.test.ts`: cubre el caso de fechas corregidas a
  `2026-10-01`, con oferta de `30000` y demanda de `20000` compatibles.
- `backend/src/tests/energy-marketplace.test.ts`: cubre los DTO propios con
  saldo derivado, reducción inválida bajo compromisos, reducción válida y
  aumento de cantidad.
- `frontend/tests/marketplace.test.tsx`: verifica la presentación es-CO de
  oferta parcial, demanda con reserva y saldo cero por reserva.

La concurrencia con PostgreSQL real sigue pendiente; las pruebas ejecutadas
usan el repositorio serializado en memoria para el servicio transaccional.