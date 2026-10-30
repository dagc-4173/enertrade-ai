# Corrección de históricos C18c — 2026-10-22

Implementado: endpoint autenticado de cobertura; fechas iniciales de la última semana registrada; consulta de consolidados solapados; deduplicación por fecha/periodo priorizando mayor ID de consolidado; respuesta con fuentes y hashes, días incompletos y número de observaciones faltantes. No se imputan valores. Agregados parciales advertidos en interfaz. El rango mensual se limita a 3660 días para acotar trabajo.

Regresiones ejecutadas backend: 9 aprobadas, 30 aserciones; incluye extensión hasta fecha sin publicar, fuentes solapadas y hueco interno, cobertura vacía. Typecheck backend aprobado. Pruebas del servicio frontend: 6 aprobadas, 14 aserciones. Build frontend aprobado. Verificación de Docker reconstruido y aceptación visual pendientes.

Limitaciones: cobertura registrada usa límites declarados de los consolidados, puede contener huecos. La selección de versión por mayor ID es determinista y queda trazada. Demanda histórica conserva DemaSIN diario, no equivale a demanda horaria. No se modifica B1 ni V5.

Apoyo de IA: inspección, implementación y pruebas asistidas por Codex; revisión y aceptación académica pendientes del estudiante. No se declara completada una HU completa por esta corrección C18c.


## Consulta directa XM — 2026-10-22

Nuevo GET autenticado /energy-series/live. Cada consulta del explorador solicita a XM el rango elegido; divide ventanas de 30 días, máximo 31 días horarios y 366 diarios/mensuales. No mantiene caché de resultados entre solicitudes; solo comparte la petición simultánea idéntica y limita a dos rangos simultáneos por proceso. Presupuesto de consulta: no inicia otra ventana después de 45 segundos; una ventana puede tardar hasta 15 segundos adicionales. Sin persistencia de observaciones en esta ruta: no modifica corpus ni datasets predictivos. La sincronización diaria de base sigue siendo independiente y depende de XM_AUTO_SYNC_ENABLED.

Respuesta identifica origen xm/local, hora de consulta XM, límites observados, hash y faltantes. Ante error del proveedor, intenta respaldo local con aviso de actualización no verificada; si no existe, responde 503. Respuesta vacía válida de XM se muestra vacía, sin sustituir por observaciones locales. Cobertura inicial es local y está etiquetada como tal; fechas iniciales son últimos siete días hasta hoy en Colombia.

Pruebas backend finales: 15 aprobadas y 47 aserciones (6 nuevas directas + 9 históricas). Typecheck aprobado. Verificación real de solo lectura contra XM para 2026-10-18: Gene 24 observaciones kWh; DemaSIN 1 observación kWh; PrecBolsNaci 24 observaciones COP/kWh. No se cambiaron registros de base en esa verificación. Pruebas HTTP de UI Docker reconstruida pendientes del estudiante.

La actualización significa consultar lo publicado al pulsar el botón; no implica telemetría instantánea, actualización de modelos ni tarea automática con la aplicación detenida. Debe conservarse esta distinción en TG-II. Apoyo de IA: implementación y verificación asistidas por Codex, revisión académica pendiente.


## Tabla histórica — 2026-10-22

Componente EnergyHistoryTable bajo la gráfica: mismas observaciones numéricas, fecha o mes, periodo XM solo para granularidad horaria, unidades kWh/COP por kWh y faltantes por día/mes. Paginación de 24 registros, reiniciada al cambiar el resultado; sin peticiones nuevas al paginar. Tabla semántica, controles de teclado y desplazamiento horizontal en pantallas estrechas. Compilación y lint frontend ejecutados sin errores. Validación visual tras reconstrucción Docker pendiente. Cambio asociado al explorador C18c; no declara una HU completa validada.
