# Predicciones: rendimiento e interpretación de resultados

Fecha: 2026-10-30 (Colombia).

## Ajuste vigente: predicción futura sin comparación posterior

Por decisión del estudiante se retiraron de la vista futura las columnas Real, Error y Error absoluto, el botón de consulta de observaciones y las métricas del día. La tabla conserva periodo/fecha, pronóstico y P10/P90 para Chronos. Permanecen las métricas históricas, el resumen diario y las gráficas. La consulta comparativa descrita más abajo documenta la iteración anterior; ya no se invoca desde esta vista. El seguimiento con pronósticos guardados y datos reales posteriores queda pendiente, sin presentarlo como implementado. Las capturas anteriores corresponden a la iteración previa.

La prueba INS-04 se actualiza para comprobar ausencia de columnas y controles de comparación; INS-06 cubre tablas puntuales de las cuatro variables. Verificación del ajuste: 70 pruebas aprobadas, 0 fallidas en cuatro archivos; compilación frontend y lint correctos. Los archivos de prueba y resultados de la sección original conservan el historial de la implementación anterior.

## Alcance y trazabilidad

Refinamiento solicitado por el estudiante a partir de observaciones del asesor. Amplía la presentación de HU05 (métricas de generación), HU07 (métricas de demanda) y HU08 (precio de referencia), conservando los modelos y horizontes de HU04/HU06. No renumera HU ni asigna sprint, fechas de actividades anteriores o story points no acordados. No cambia entrenamiento, parámetros, pesos, transacciones ni pagos.

Estado: implementado y probado técnicamente en local. Revisión visual con datos de ejemplo realizada. Validación académica y despliegue de este incremento en Azure pendientes.

## Comportamiento

- Ficha visible del modelo con MAE, RMSE, WAPE, sesgo, unidades, fechas, número de observaciones y explicación de cada indicador. WAPE no se transforma en exactitud.
- Ridge mantiene métricas específicas del horizonte. Oferta Ridge y demanda diaria las consultan al seleccionar fecha. Ridge horario las entrega con su resultado.
- Chronos demanda conserva la evaluación retrospectiva h1 ya publicada en sus metadatos (no se ejecutó una evaluación nueva). Se muestran sesgo, n y cobertura; si el usuario pide otro horizonte se advierte que h1 no acredita ese desempeño. Oferta y precio Chronos siguen indicando evaluación específica pendiente, sin copiar métricas de demanda.
- B1 se identifica como referencia determinista; consulta sus métricas desde el catálogo existente y comprueba identidad y versión.
- Tiempo de respuesta medido en cliente: incluye red, captura XM y cálculo; no se presenta como tiempo puro de inferencia ni benchmark comparativo.
- Resumen diario: suma de energía por periodo o promedio de precios, mínimo y máximo. Suma de medianas horarias no se etiqueta como mediana probabilística del total.
- Tabla accesible con periodo/hora, estimación, P10/P90 cuando existen y columnas de real/error. Error = pronóstico - observado; no se calcula contra el día de origen.
- Lectura visible de los valores de todas las líneas al apuntar o enfocar un punto con teclado. Escala válida para series constantes y sin unir huecos numéricos. Gráfica del pronóstico conservada si falla el contexto histórico separado.

## Consulta de observaciones del mismo día

GET autenticado `/api/energy-series/forecast-observations?series=demand&date=2026-10-29`.

Variables admitidas: supply/Gene horario, demand/DemaReal horario, price/PrecBolsNaci horario y daily/DemaSIN diario. Solo un día por solicitud. Cache-Control: no-store; máximo dos consultas distintas en curso y deduplicación de consultas simultáneas idénticas. Consulta al proveedor XM existente, sin escrituras de datasets ni cambios en pronósticos.

No consulta días sin finalizar en Colombia. Solo compara 24 periodos únicos completos (o un total diario DemaSIN), misma fecha y variable. No imputa faltantes. Errores del proveedor conservan el pronóstico. WAPE queda no definido cuando la suma absoluta observada es cero.

Limitación: el contraste se realiza sobre el resultado cargado en la vista; no agrega recuperación de pronósticos anteriores tras recargar/cerrar la página ni evaluación automática al día siguiente. No constituye un backtest nuevo ni monitoreo prospectivo continuo. Las observaciones XM pueden revisarse después de publicadas.

## Pruebas ejecutadas

| ID | HU asociada | Precondición y pasos | Esperado | Obtenido | Estado / evidencia |
| --- | --- | --- | --- | --- | --- |
| INS-01/02 | HU05/HU07/HU08, refinamiento | Datos controlados; resumir energía/precio y alinear periodos desordenados, cero e incompletos | Suma/promedio correctos; errores por pares; WAPE indefinido con denominador cero | Coincide | Aprobado; frontend-tests.txt |
| INS-03/04/05 | HU05/HU07/HU08, refinamiento | Renderizar ficha/tabla; comprobar horizonte distinto y respuestas ajenas | Avisos y unidades correctos; sin precisión inventada ni errores futuros | Coincide | Aprobado; frontend-tests.txt |
| OBS-01/02/03/04 | HU05/HU07/HU08, refinamiento | Servicio con proveedor simulado; solicitar fechas futuras, parciales, duplicadas y DemaSIN | No consultar futuro ni comparar datos incorrectos; distinguir demanda horaria/diaria | Coincide | Aprobado; backend-tests.txt |
| OBS-05/06 | HU14/HU15, soporte del refinamiento | Solicitudes concurrentes y ruta HTTP sin/con autenticación de prueba | Límite, deduplicación, 401 sin autenticación y no-store | Coincide | Aprobado; backend-tests.txt |
| Serie constante/huecos | HU05/HU07/HU08, refinamiento | Renderizar SVG constante con P1/P3 | Sin NaN/Infinity ni segmento sobre P2 faltante | Coincide | Aprobado; frontend-tests.txt |
| Revisión visual local | HU05/HU07/HU08, refinamiento | Vista aislada con datos de ejemplo; consultar real simulado, abrir tabla, enfocar punto con Tab y revisar 390 px | Ficha legible, comparación/tabla alineadas, lectura con teclado y sin desbordamiento global | Coincide | Revisado en navegador; capturas adjuntas |

Frontend: 270 pruebas aprobadas, 0 fallidas (32 archivos, 1194 aserciones). Backend afectado: 21 aprobadas, 0 fallidas (3 archivos, 72 aserciones). Compilación frontend, lint, tipos backend y diff --check correctos. No se ejecutó una nueva inferencia Python ni se verificó entrega en Azure como parte de este incremento. Las capturas son datos de ejemplo, no evidencia de precisión real ni de consultas reales a XM.

## Uso de IA

ChatGPT/Codex apoyó el análisis del código, implementación, pruebas automatizadas y revisión de interfaz. Verificación: pruebas y comprobaciones indicadas; revisión del estudiante y aceptación del asesor pendientes. No se alteran resultados de evaluaciones ML existentes.
