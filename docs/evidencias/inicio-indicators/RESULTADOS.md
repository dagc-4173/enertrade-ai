# Inicio: cobertura de indicadores — 2026-10-21

Estado: implementado y probado localmente. No acredita despliegue ni validación académica.

HU relacionadas: HU17 trazabilidad, HU19 indicadores; conserva la separación de runtime y validación de HU18. No se declara cierre integral de las HU.

## Comportamiento
Cinco endpoints POST horarios autenticados incorporados al middleware de trazas: hourly-supply, hourly-demand, hourly-price, hourly-ridge/demand y hourly-ridge/price. Oferta y demanda reutilizan sus categorías funcionales; precio horario usa forecasts_hourly_price. Precio agregado suma B1 persistido más trazas horarias exitosas sin duplicar el POST legacy. Modelo, versión, fecha objetivo, elección de modelo y UUID de evidencia local se conservan sin guardar el cuerpo completo ni secretos. Consultas de catálogo continúan incluidas en solicitudes registradas.

Inicio distingue artefactos del catálogo de capacidades funcionales, y finalización de solicitudes de precisión predictiva. Informa acumulado, alcance del catálogo y ausencia de trazas históricas horarias. No hay reconstrucción retroactiva de evidencia local. Persistencia de trazas sigue best-effort.

## Pruebas ejecutadas
- TRACE-HOURLY / HU17: servidor Express temporal con respuestas controladas; cinco rutas, identidad, referencia local, autenticación y fallo 503. Esperado: una traza por respuesta autenticada, ninguna por rechazo no autenticado, fallo clasificado failed. Obtenido: aprobado. No ejecuta inferencia ML ni consulta XM.
- IND-HOURLY / HU19: store controlado con B1 y precio horario, fallo horario y demanda; esperado precio=2 sin duplicar B1, total=4, éxito=75%, duración media=100ms. Obtenido: aprobado.
- Dos archivos backend: 17 pass, 0 fail, 63 aserciones.
- Frontend completo: 239 pass, 0 fail, 1034 aserciones.
- Backend typecheck, frontend build y lint: aprobados.
- Navegador real: texto actualizado de acumulado y Estado del servicio confirmado por DOM. No se ejecutó un nuevo pronóstico real para esta modificación.

## Pendientes
Disponibilidad por variable y actualización XM; período seleccionable/fecha de consulta; integración de Chronos en catálogo global; rediseño compacto y agrupación de horizontes. Las nuevas trazas requieren el backend con esta versión en ejecución. No se modifican pesos, datasets ni resultados de modelos.

## Uso de IA
Codex apoyó revisión, implementación y pruebas. Verificación mediante pruebas ejecutadas, comprobación de tipos y DOM de la aplicación local. Evidencia útil para informe TG-II; revisión del estudiante pendiente.
