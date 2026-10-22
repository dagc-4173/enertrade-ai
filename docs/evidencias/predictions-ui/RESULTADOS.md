# Predicciones — reorganización visual

Fecha: 21/10/2026. Estado: implementado y probado localmente, incluyendo revisión en el navegador con la sesión existente del estudiante. No se modificaron modelos, parámetros, horizontes, fuentes ni contratos del backend. No se hizo despliegue ni commit.

## Cambios visibles

- Tres pestañas: Oferta, Demanda y Precio. Solo se monta la variable y el método activos; ya no se apilan seis paneles de pronóstico.
- Un selector común de modelo. Ridge y Chronos se muestran por resolución horaria; demanda V5 diaria y precio B1 siguen disponibles como alternativas explícitas, con su fuente y frecuencia diferenciadas.
- Gráfica antes de tablas y detalles extensos. Modelo, origen, trazabilidad, evaluación y periodos completos usan desplegables, sin retirar el estado experimental.
- Histórico independiente, cerrado al inicio y cargado solo al abrirlo.
- Controles alineados y colores existentes; no se instalaron dependencias, fuentes o iconos nuevos.
- Menú móvil compacto y desplazable horizontalmente solo en Predicciones. Se corrigió el ancho mínimo de la cuadrícula para evitar que la gráfica ensanchara toda la página.
- El SVG adapta su ancho con ResizeObserver y limpia el observador al desmontarse. Los ejes usan cifras compactas; tooltips y tablas conservan el detalle numérico. La leyenda utiliza los colores y trazos de las curvas.
- Se aclara que un dataset sin fechas elegibles no equivale necesariamente a uno sin preparar. B1 conserva sus restricciones reales y el mensaje de insuficiencia.

El cambio de variable restablece el modelo a Ridge; el cambio de método monta el recorrido correspondiente y limpia el resultado anterior mediante la clave del componente. Los controladores de cancelación existentes evitan mostrar respuestas tardías de una selección anterior. Esto no implica cancelación garantizada de la inferencia ya iniciada en el servidor.

## Evidencia visual

- [Escritorio](2026-10-21/desktop.png): navegación, selector común y formulario de precio.
- [Gráfica y métricas](2026-10-21/chart.png): pronóstico real Ridge de precio, con referencia observada fechada y métricas históricas del horizonte correcto.
- [Móvil](2026-10-21/mobile.png): navegación compacta y formulario en 390 × 844.

La comprobación DOM final en móvil registró ancho de viewport 390, ancho documental 375, una sola vista activa y SVG de 305 px con viewBox `0 0 305 300`. No hubo desbordamiento horizontal de la página; el menú conserva su propio desplazamiento. La captura inicial con gráfica había revelado un ancho documental de 630 px; ese defecto se corrigió y se volvió a comprobar. Se restauró el tamaño habitual del navegador al finalizar.

## Pruebas ejecutadas

| ID | HU | Pasos / precondición | Resultado esperado | Obtenido / estado |
|---|---|---|---|---|
| UI-PRED-01 | HU-20 | Renderizar Predicciones inicialmente | Tres pestañas, una vista activa, un selector común e histórico sin cargar | Aprobado |
| UI-PRED-02 | HU-06/08/20 | Seleccionar recorridos diarios/B1 en componentes | Conservar DemaSIN diario y regla B1, sin presentarlos como modelos horarios equivalentes | Aprobado |
| UI-PRED-03 | HU-06/08/20 | Renderizar Ridge horario y Chronos por variable | Panel de la fuente correcta sin segundo selector de modelo | Aprobado |
| UI-MAN-01 | HU-20 | Pestañas en Edge con sesión existente; navegación con flecha derecha | Cambiar Oferta→Demanda→Precio y foco visible | Aprobado |
| UI-MAN-02 | HU-06/20 | Demanda horaria Ridge, fecha 22/10/2026, pulsar generar | 24 periodos, origen, h4, gráfica y métricas propias | Aprobado con XM real; origen 18/10 |
| UI-MAN-03 | HU-08/20 | Precio horario Ridge, fecha 22/10/2026, pulsar generar | 24 periodos, unidad COP/kWh, h4 y gráfica fechada | Aprobado con XM real; origen 18/10 |
| UI-MAN-04 | HU-06/08/15 | Cambiar a V5 diario y luego B1 | Descripción de frecuencia/fuente correcta y ausencia de fecha B1 si falta el día anterior completo | Aprobado; no se habilitó una fecha ficticia |
| UI-MAN-05 | HU-20 | Reducir a 390 × 844 y revisar anchos tras generar resultado | Sin desbordamiento de la página; escala SVG adaptada | Aprobado tras corregir la cuadrícula |

La revisión manual de modelos cubrió las pestañas, las opciones V5/B1 y dos generaciones Ridge reales. La selección Chronos se comprobó mediante renderizado y regresión de sus contratos; no se repitió una inferencia Chronos manual durante esta revisión visual. No se comprobaron todos los navegadores ni todos los tamaños posibles.

Regresión completa del frontend: **239 aprobadas, 0 fallidas, 1.034 aserciones, 23 archivos**. [Registro](2026-10-21/frontend-tests.log). Build/TypeScript y ESLint aprobados. Se corrigieron durante el trabajo la separación de constantes para Fast Refresh, una asignación redundante y la codificación de tres aserciones nuevas; no se alteraron criterios predictivos para hacer pasar las pruebas.

## Archivos principales

`frontend/src/pages/Predictions.tsx`, `Predictions.css`, `prediction-methods.ts`; componentes `ForecastPanel.tsx`, `HourlyDemandPanel.tsx`, `HourlyRidgeResult.tsx`, `PreparedDatasetSelect.tsx` y `SeriesChart.tsx`. Pruebas nuevas en `predictions-layout.test.tsx`; se actualizó la expectativa anterior de seis paneles en `forecast.test.tsx`.

## Límites y uso académico

Las curvas observadas y futuras siguen siendo días diferentes. La revisión visual no acredita exactitud, calibración, promoción de modelos ni validación académica. Tampoco equivale a una auditoría completa de accesibilidad o autenticación. Las consultas reales generaron evidencia local del recorrido existente; no se puntuaron pronósticos ni se modificaron journals prospectivos.

Estas capturas y pruebas son evidencia importante para el informe TG-II y HU-20, sin declarar las HU completadas por sí solas. ChatGPT/Codex apoyó organización visual, implementación, pruebas y documentación mediante la habilidad `design-taste-frontend`, adaptada al estilo existente. El estudiante debe revisar y sustentar el resultado.
