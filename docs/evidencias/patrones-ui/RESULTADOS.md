# Correcciones de Patrones — 2026-10-21
Estado: implementado y probado localmente; no acredita despliegue ni validación académica. HU12 análisis y HU13 consulta; sin cierre integral de HU.

Archivos: frontend/src/pages/Patterns.tsx, Patterns.css, utils/patternPresentation.ts, tests/matching-patterns.test.tsx.

Selector restringido a tres perfiles XM 1.0.0 realmente admitidos por backend; botón deshabilitado sin selección. Histórico con detalle reutiliza snapshot, sin recalcular. Persistencia fallida visible con alert y sin mensaje falso de guardado. Estados/direcciones en español; pendiente expresada por observación ordenada. Recurrencia con barras de media y tabla de media/min/max/muestra, agrupación por hora o día, permite medias negativas. Descripciones originales preservadas en trazabilidad. Filtros con etiquetas, rango inválido local, limpiar y reintentar; errores del histórico y del análisis independientes.

Pruebas: frontend completo 243 pass, 0 fail, 1058 aserciones; prueba focal posterior 10 pass/0 fail incluyendo histórico sin campo persistence; build y lint aprobados antes del último ajuste CSS móvil. Backend revisión previa 19 pass/0 fail, sin modificaciones backend.

Manual: navegador autenticado abrió primer análisis ya registrado: precio, 24216 observaciones, 2024-01-01–2026-10-05, distribución, tendencia decreciente y recurrencia24grupos. No se pulsó Analizar patrones ni se creó análisis. Selector ya no incluye perfiles simulados incompatibles. Móvil390px/documento375px tras corrección de mínimos de ancho; tabla mantiene scroll local. Captura adjunta anterior a ajuste exclusivo móvil, desktop sin cambios.

Límites: no se añaden modelos ni inferencia predictiva, intervalos probabilísticos ni significancia estadística. Datos de recurrencia son resúmenes descriptivos. Fallo de guardado cubierto por fixture transitorio, no se provocó fallo real de base de datos. Exportación y paginación no implementadas en esta tarea.

IA: Codex apoyó implementación y comprobación; revisión del estudiante pendiente. Evidencia importante para TG-II.
