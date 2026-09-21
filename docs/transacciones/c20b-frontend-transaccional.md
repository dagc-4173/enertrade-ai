# C20b - Frontend transaccional y mercado activo

## Alcance

C20b implementa el cliente visual para el nucleo transaccional simulado C20a. Es un cambio de alcance TG-II autorizado por el estudiante y la historia transaccional permanece provisional, pendiente de formalizacion en backlog.

Marketplace conserva Mis ofertas y Mis demandas. Agrega Mercado activo con ofertas y demandas `ACTIVE` de terceros, su saldo disponible, precio y fecha de entrega. El backend expone `GET /market/offers` y `GET /market/demands`, excluye publicaciones propias y descuenta transacciones `PENDING_ACCEPTANCE` y `CONFIRMED`. No muestra cantidad original cuando difiere del saldo ni datos del propietario.

## Propuesta y estados

Desde Mercado activo, el participante selecciona una publicacion propia compatible y confirma manualmente una cantidad hasta el minimo de ambos saldos. La interfaz verifica fecha, precio y cantidad; el backend conserva la autoridad final. Matching sigue siendo informativo y no crea transacciones automaticamente.

Mis transacciones consume los endpoints C20a, permite filtrar todos los estados y muestra rol derivado, cantidad, precio, total, fecha, aceptaciones y confirmacion. Mientras una transaccion esta pendiente, solo el participante que no ha aceptado ve Aceptar; ambos participantes pueden Rechazar o Cancelar segun la autorizacion backend. Confirmed es de solo lectura.

Las cantidades, precios, totales y fechas usan los formatters centrales `es-CO`. La interfaz explica que una confirmacion es una transaccion energetica simulada: pasarela de pagos y liquidacion financiera no forman parte de esta version. No existen botones, estados ni mensajes de pago.

## Privacidad y limites

Los DTO de Mercado activo no incluyen `userId`, correo ni nombre. Los DTO de transaccion omiten IDs de comprador/vendedor y exponen unicamente `role` derivado para el usuario autenticado. Sesion se conserva por cookie existente; no se guardan IDs sensibles en `localStorage`.

No se incorporaron endpoints globales adicionales, pagos, checkout, datos de tarjeta, modelos ML ni datasets.

## Pruebas y evidencia pendiente

Se ejecutaron pruebas automatizadas backend y frontend, build y lint. La prueba manual controlada con dos cuentas sigue pendiente: no se ejecutaron publicaciones ni transacciones reales para no fabricar evidencia.

Al ejecutar esa prueba, conservar capturas de: Mercado activo con publicacion externa, propuesta `PENDING_ACCEPTANCE`, aceptacion de comprador, aceptacion de vendedor, `CONFIRMED`, saldo parcial/actualizado, historial de transacciones y el aviso de pagos fuera de alcance.
