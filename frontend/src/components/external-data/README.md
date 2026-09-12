# Fuentes de datos: integración frontend

Panel del Dashboard que consulta exclusivamente al backend mediante apiClient.
El catálogo, nombres, métricas y unidades proceden de la respuesta del servidor.
No se realizan llamadas directas a XM ni importaciones a EnergyDataset.
Las funciones de HU-01/HU-02/HU-03 no se modifican.

El servicio verifica la estructura del catálogo y del resultado, correspondencia
con la consulta, valores finitos, periodos y ausencia de registros duplicados.
Respuestas incompatibles producen ApiError de tipo response. Los errores HTTP
se propagan desde apiClient; la UI muestra serverMessage o un mensaje genérico
seguro cuando no existe un envelope válido. No se muestran errores internos.
Los filtros se omiten: las métricas iniciales no admiten filtros con valores.

La UI valida campos, orden de fechas y hasta 30 días inclusivos; el backend
mantiene la autoridad. Muestra records.length, sin inventar recordCount.
Los resultados previos se limpian al cambiar parámetros o iniciar otra consulta.
Las solicitudes se cancelan al desmontar el panel. La tabla tiene desplazamiento
para consultar hasta 720 registros horarios sin extender todo el Dashboard.

## Validación del incremento

- `npx.cmd tsc -b --pretty false`: correcto.
- `npm.cmd run lint`: correcto.
- `npm.cmd run build`: correcto.
- `git diff --check`: correcto.

Typecheck/build necesitaron permisos para escribir la caché existente de
TypeScript en node_modules/.tmp; tras repetirlos finalizaron correctamente.
No se instalaron dependencias.

El frontend no tiene script, framework ni pruebas automatizadas existentes.
No se añadió uno para este incremento. Las comprobaciones anteriores son
estáticas/de compilación: no prueban el comportamiento de los servicios ni la UI.
Quedan pendientes pruebas automatizadas de listado, consulta, respuestas inválidas
y errores HTTP, y la verificación interactiva desde navegador de las tres métricas,
catálogo vacío, resultado vacío, reintento y rechazo de rangos inválidos.
La evidencia HTTP real previa del backend no se presenta como prueba de React.
