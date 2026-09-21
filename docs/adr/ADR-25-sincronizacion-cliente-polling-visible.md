# ADR-25 - Sincronización de cliente mediante polling visible

**Estado:** Aceptado para C21d.

## Contexto

Marketplace y Transactions consultaban datos al cargar, cambiar filtro o completar acciones locales. Una segunda sesión podía crear, editar, cancelar, aceptar o contrapropor sin que la primera actualizara hasta recargar la página.

## Alternativas

- **Polling:** consultas periódicas HTTP usando los endpoints existentes.
- **SSE:** actualización unidireccional desde servidor, con canal, autenticación y reconexión adicionales.
- **WebSocket:** canal bidireccional persistente, con infraestructura de conexiones, autorización y recuperación adicional.

## Decisión

Se adopta polling visible cada 5 segundos mediante un hook reutilizable. El ciclo se pausa cuando `document.visibilityState` no es `visible`, se reanuda de inmediato al volver visible y limpia intervalos, listener y `AbortController` al desmontar.

El polling actualiza datos de dominio, pero no ejecuta matching ni altera formularios o filtros locales. El matching continúa siendo una operación explícita; un fingerprint de mercado informa cuando sus resultados quedaron desactualizados.

## Consecuencias

- La latencia máxima aproximada es 5 segundos mientras la pestaña es visible; no se denomina tiempo real estricto.
- Existe tráfico HTTP periódico en pantallas abiertas, limitado por visibilidad y sin infraestructura persistente adicional.
- Se reutilizan los contratos REST y la implementación se mantiene acotada al frontend.
- SSE o WebSocket podrán reevaluarse si la latencia, volumen de usuarios o eventos crecen más allá de esta fase académica.