# C20g - Gestión frontend de propuestas transaccionales

## Alcance

La interfaz de transacciones consume el ownership derivado del backend, sin recibir ni mostrar IDs de participantes o del creador. Los pagos y la liquidación financiera permanecen fuera de alcance.

## Ownership y acciones

- `CREATED_BY_ME`: permite editar la cantidad y eliminar lógicamente una propuesta pendiente, incluso tras una aceptación individual; el participante también puede aceptar.
- `RECEIVED`: permite aceptar o rechazar una propuesta pendiente.
- `LEGACY_UNKNOWN`: se identifica como propuesta histórica y no muestra edición ni eliminación. Conserva aceptar o rechazar sólo conforme al contrato backend heredado.
- Tras cualquier aceptación individual, la propuesta creada por la persona mantiene edición y eliminación mientras siga pendiente. Editar invalida ambas aceptaciones, por lo que ambas partes deben aceptar nuevamente.
- Las transacciones confirmadas, rechazadas o canceladas son de sólo lectura.

## Edición y cancelación

`PATCH /transactions/:id` envía únicamente `quantityKwh`. El formulario mantiene precio, fecha de entrega y total actual en sólo lectura, e informa que el backend recalcula el total al guardar.

"Eliminar propuesta" llama `POST /transactions/:id/cancel` tras confirmación. No usa `DELETE`, no borra la tarjeta y el estado resultante queda en el historial como `CANCELLED`.

Los mensajes de error conservan `serverMessage` cuando el backend lo proporciona. Tras editar, la interfaz informa que ambas partes deben aceptar nuevamente. Los mensajes exitosos también informan rechazo, liberación de reserva o confirmación.

## Pruebas automatizadas

La cobertura frontend verifica:

- contrato de `proposalOwnership`, incluidos valores inválidos e IDs internos prohibidos;
- `PATCH` con respuesta 200 y payload exclusivo `quantityKwh`;
- reglas de creador, receptor, aceptación previa y legado mediante helpers puros;
- respuestas válidas de editar, aceptar, rechazar y cancelar con `role` y `proposalOwnership`.

El harness actual usa `bun:test` y renderizado estático de React; no ejecuta interacciones DOM de navegador. La validación manual pendiente debe realizarse con dos cuentas:

1. Cuenta B crea una propuesta de 15.000 kWh, la edita a 12.000 kWh y confirma saldo y total actualizados.
2. Cuenta B elimina una propuesta y confirma que queda cancelada en historial.
3. Cuenta A recibe, acepta o rechaza; tras la primera aceptación, Cuenta B puede editar o eliminar mientras esté pendiente. Al editar, ambas aceptaciones vuelven a pendiente.
4. Ambas cuentas aceptan una propuesta nueva y confirman el estado final `CONFIRMED` sin acciones.

No se afirma que estas pruebas manuales hayan sido ejecutadas.