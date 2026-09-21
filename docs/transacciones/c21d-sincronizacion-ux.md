# C21d - Sincronización automática y UX localizada

## Alcance y trazabilidad

Extiende la propuesta provisional C21b del Marketplace. Implementa actualización automática del cliente, entradas numéricas en formato es-CO y filtros de publicaciones propias. No modifica matching-v1, backend, Prisma, pagos ni modelos de IA.

## Sincronización casi en tiempo real

`useVisiblePolling` consulta cada 5 segundos como mínimo solo cuando la pestaña es visible. Pausa al ocultarse, refresca inmediatamente al volver visible, evita solicitudes solapadas dentro del ciclo y aborta la solicitud activa al desmontar.

Marketplace actualiza ofertas y demandas propias, además de las publicaciones activas externas. Transactions actualiza `/transactions/mine` respetando el filtro seleccionado; si el historial está abierto, recarga también sus revisiones. Las acciones locales mantienen su refresh inmediato. El polling solo reemplaza datos de dominio: no cierra selección, formularios, contrapropuestas, historial ni filtros.

No se afirma tiempo real estricto: la latencia esperada de otra sesión es de hasta aproximadamente 5 segundos mientras la pestaña esté visible.

## Matching informativo

El polling no llama `POST /matches/suggest`. Después de generar sugerencias, Marketplace conserva un fingerprint estable de oferta/demanda activa (id, saldo disponible, precio o precio máximo, fecha y estado). Si dicho fingerprint cambia, muestra `El mercado cambió desde el último emparejamiento.` y ofrece `Actualizar sugerencias`. Solo esa acción explícita vuelve a solicitar matching.

## Números es-CO

`LocalizedDecimalInput` usa `type="text"` e `inputMode="decimal"`. Separa el valor mostrado del canónico: `50.325,75` se convierte en `50325.75`; el punto es agrupador de miles y la coma es decimal. Cantidad admite hasta 2 decimales y precio hasta 5. Al perder foco se agrupan miles, sin reformatear agresivamente durante escritura para preservar el cursor.

Los formularios de publicación, edición, negociación y contrapropuesta envían números canónicos al backend. Los mensajes de validación permanecen en lenguaje de usuario: cantidad o precio válidos mayores que cero.

## Filtros

Ofertas y demandas tienen filtros independientes: Activas, Completadas, Vencidas, Canceladas y Todas. El valor inicial es Activas. Los conteos se calculan desde listados ya cargados y cada resultado se ordena por `updatedAt` descendente. El polling conserva el filtro y los registros históricos no se eliminan; solo dejan de mostrarse bajo un filtro distinto.

## Limitaciones y evidencia

Las pruebas automatizadas cubren parser/formato canónico, límites decimales, filtros, orden y fingerprint. La infraestructura actual no incluye un renderer DOM con fake timers, por lo que el ciclo de visibilidad se valida por typecheck/lint y prueba manual de dos sesiones. Pendiente: conservar una captura o log de esa prueba manual como evidencia académica.