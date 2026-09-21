# PE-12 - Sincronizacion automatica del mercado entre sesiones

## ID

PE-12

## Nombre

Sincronizacion automatica del mercado entre sesiones.

## Objetivo

Verificar que los cambios de mercado puedan reflejarse automaticamente entre dos sesiones autenticadas sin recargar manualmente la pagina, mediante polling visible.

## Alcance

C21d.

## Requisitos/HU relacionados

- Propuesta provisional C21d del backlog Marketplace.
- Publicaciones y transacciones simuladas de HU-21 y HU-22 como antecedentes funcionales.

No se crea ni se asigna una historia de usuario oficial nueva.

## Precondiciones

- Dos sesiones autenticadas simultaneas.
- Ambas sesiones con Marketplace disponible.
- Publicaciones de mercado y sugerencias de matching ya cargadas cuando corresponde verificar el estado desactualizado.

## Datos de prueba observados

Se utilizaron dos sesiones/cuentas simultaneas. Ambas mostraron Marketplace y se realizaron modificaciones del mercado durante la observacion funcional. No se registran tiempos cronometrados ni identificadores de cuenta.

## Pasos ejecutados

1. Se abrieron dos sesiones autenticadas con Marketplace visible.
2. Se modifico el mercado desde una de las sesiones.
3. Se observo la actualizacion del estado visible en la otra sesion, sin usar recarga manual de pagina.
4. Con sugerencias de matching ya generadas, se modifico nuevamente el mercado.
5. Se verifico el aviso de sugerencias desactualizadas y la accion para actualizarlas.
6. Se verifico que las sugerencias anteriores permanecieran visibles hasta la decision explicita del usuario.

## Resultado esperado

- El polling opera aproximadamente cada 5 segundos mientras la pestana esta visible y actualiza de inmediato al volver a estarlo.
- Marketplace y Transactions reflejan los cambios del mercado.
- Los formularios locales se preservan.
- El polling no recalcula matching automaticamente.
- Un cambio de mercado posterior al matching marca las sugerencias como desactualizadas.

## Resultado obtenido

El estado visible del mercado se sincronizo entre las dos sesiones sin requerir F5, en el intervalo esperado del polling (~5 s) definido por la implementacion. Cuando el mercado cambio despues de generar matching, una sesion mostro el mensaje "El mercado cambió desde el último emparejamiento." y el boton cambio a "Actualizar sugerencias". Las sugerencias anteriores siguieron visibles hasta que el usuario decidio actualizarlas. No se ejecuto matching automaticamente por efecto del polling.

## Estado

**APROBADA TECNICAMENTE.** La evidencia valida el comportamiento funcional observado. La validacion academica/formal permanece pendiente de la revision final del informe.

## Evidencia

### Evidencia visual pendiente de incorporacion al repositorio

- `pe12-01-dos-sesiones-mercado.png`
- `pe12-02-matching-desactualizado.png`
- `pe12-03-sugerencias-actualizadas.png`

No se incluyen enlaces a estos archivos porque no estan incorporados al repositorio.

## Limitaciones

- No incorpora WebSocket ni SSE.
- No mide milisegundos exactos del polling.
- No implica despliegue en produccion.
- No ejecuta matching automaticamente ni representa una transaccion energetica real.

## Relacion con objetivo especifico

Se relaciona principalmente con OE3 y OE4. Esta evidencia no afirma el cumplimiento total de dichos objetivos.

## Observacion academica

La prueba manual documenta comportamiento funcional observado en el entorno de desarrollo. No constituye validacion academica o formal del incremento.
