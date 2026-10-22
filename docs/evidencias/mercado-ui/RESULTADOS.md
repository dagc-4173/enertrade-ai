# Mercado: presentación — 2026-10-21
Estado: implementado y probado localmente. No acredita despliegue ni cierre integral de historias.

Cambios: guía Publica–Verifica–Negocia y alcance académico explícito; formularios horarios desplegables conservando su montaje y borradores; tabla del editor limitada en altura con cabecera fija; separación Mis ofertas/Mis demandas; alcance y fecha efectiva del filtro visibles; contadores de estado calculados sobre la misma fecha que sus tablas; aria-pressed en filtros; controles de mercado horario distribuidos y mensajes para selección pendiente o falta de contraparte propia; navegación móvil compacta. Sin cambios de reglas backend ni nuevas dependencias.

Archivos: frontend/src/pages/Marketplace.tsx, Marketplace.css y components/HourlyMarket.tsx.

Verificación: frontend 239 pass, 0 fail, 1035 aserciones; build y lint aprobados; navegador autenticado confirmó apertura/cierre del formulario, filtros con conteos correspondientes al 07/10/2026, publicaciones históricas visibles como vencidas/completadas; no había publicaciones externas horarias disponibles. Vista móvil 390px/documento375px sin desbordamiento horizontal; viewport restaurado. Captura adjunta. No se crearon publicaciones, verificaciones ni negociaciones.

Pendiente de entrega: prueba integral controlada con dos usuarios y publicaciones futuras verificadas, incluyendo propuesta y aceptación; este trabajo no certifica esa prueba. Se observa acción de verificación en filas vencidas/completadas: revisar su pertinencia y respuesta backend en una siguiente revisión funcional, sin inferir que permita negociar.

Trazabilidad: alcance funcional de publicaciones, matching y negociación existente; conservar junto a sus historias y evidencias, sin asignar identificadores de HU no verificados. IA: Codex apoyó implementación y comprobación; revisión del estudiante pendiente.
