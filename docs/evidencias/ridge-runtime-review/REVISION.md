# Revisión funcional de Ridge — oferta, demanda y precio

Fecha: 21 de octubre de 2026. Revisión de código, artefactos, configuración local y servicios con lecturas de la base configurada. No se modificaron interfaz, datos, modelos, parámetros ni configuración. Se añadieron únicamente el script de auditoría y las evidencias. No hubo sincronización, entrenamiento, puntuación prospectiva ni despliegue.

## Resultado principal

| Variable | Implementación conectada al pronóstico tradicional | Salida | Horizonte desde el origen | Estado |
|---|---|---|---|---|
| Oferta | Ridge directo V2, un modelo por horizonte h1..h7 | 24 valores horarios de Gene, kWh | 1..7 días | Implementado; prueba histórica real satisfactoria; datos actuales insuficientemente recientes |
| Demanda | Ridge directo V5, un modelo por horizonte h1..h6 | Un total diario DemaSIN, kWh | 1..6 días | Implementado; prueba histórica con reloj controlado satisfactoria; validación prospectiva pendiente |
| Precio | Regla determinista B1, no Ridge | 24 precios PrecBolsNaci, COP/kWh | Día anterior completo al objetivo | Implementado; prueba histórica real satisfactoria; sin datos para mañana |

La captura del estudiante no demuestra por sí sola un fallo matemático de Ridge. La consulta de disponibilidad a la base configurada confirmó `SOURCE_DATA_STALE` para las tres variables. Los modelos tradicionales consumen datos consolidados/preparados de PostgreSQL; Chronos realiza adquisiciones separadas de XM y conserva evidencia local. Una consulta Chronos exitosa no actualiza automáticamente los preparados utilizados por Ridge/B1.

## Hallazgos priorizados

### 1. Datos desactualizados bloquean los pronósticos futuros

En la consulta del 21/10/2026:

| Fuente | Última fecha recibida | Última fecha utilizable informada | Ventana del modelo tradicional |
|---|---|---|---|
| Gene | 03/10/2026 | 03/10/2026 | 04..10/10/2026 |
| DemaSIN | 04/10/2026 | 03/10/2026 | 04..09/10/2026 desde origen resuelto |
| PrecBolsNaci | 05/10/2026 | 05/10/2026 | 06/10/2026 |

Ninguna ventana incluye mañana, 22/10. Las solicitudes reales a los servicios para esa fecha fueron rechazadas: oferta y demanda con 422 `FORECAST_HORIZON_NOT_SUPPORTED`; precio B1 con 422 `FORECAST_DATA_INSUFFICIENT`. Los selectores vacíos concuerdan con la disponibilidad calculada.

La configuración local `backend/.env` tiene `XM_AUTO_SYNC_ENABLED="false"`; `backend/index.ts` no inicia el scheduler en ese caso. Es un factor concreto que debe revisarse antes de atribuir todo a indisponibilidad de XM. No se cambió el valor ni se comprobó el entorno efectivo del proceso que produjo la captura. Tampoco se ejecutó la sincronización manual durante la revisión. No se acredita la disponibilidad actual del proveedor externo.

Recomendación: verificar y ejecutar el recorrido de actualización, validación y preparación antes de cambiar horizontes o reentrenar. No ampliar artificialmente h1..h7/h1..h6 para cubrir el retraso.

### 2. Catálogo y versiones anuncian modelos antiguos como activos

`backend/src/services/model-catalog.service.ts` importa los loaders legacy `xm-gene-ridge` y `xm-demandasin-ridge`; los etiqueta `activeInRuntime: true` y `promoted: true`. `backend/src/services/capability-versions.service.ts` anuncia esas mismas identidades como activas. Sin embargo, `forecast.controller.ts` ejecuta oferta directa V2 y demanda directa V5.

Esto afecta trazabilidad y puede asociar métricas, variables y estados de una versión antigua a la capacidad actual. Los endpoints específicos `/forecasts/supply/metrics` y `/forecasts/demand/metrics` sí usan respectivamente V2 y V5. No trasladar las etiquetas `promoted` del catálogo legacy al V5: el artefacto V5 conserva `pendingProspectiveValidation`.

Recomendación: alinear el catálogo general y el registro de versiones con las familias/horizontes actuales, conservando las versiones anteriores como históricas y sus evidencias. Debe hacerse antes de usar ese catálogo como selector único en una interfaz consolidada.

### 3. Precio Ridge existe como experimento, no como opción activa

`price-forecast.service.ts` importa exclusivamente `xm-preciobolsnaci-b1/rule-loader` y calcula `P_estimado(D,p)=P(D−1,p)`. La existencia de carpetas Ridge V1/V2/V3 o de parámetros congelados V4 no implica integración en el endpoint de precio.

El experimento Ridge inicial de precio no superó el umbral de validación: MAE 73,638496 frente a B1 62,984025 COP/kWh, aproximadamente 16,92 % peor. Se detuvo antes de test. No debe generalizarse ese resultado a todas las versiones posteriores.

Precio directo V1 obtuvo candidatura técnica retrospectiva en h4/h5/h6; h1/h2/h3/h7 no. V3 combinada no justificó sustituir V1 y V4 Gene-only permanece bajo protocolo prospectivo. La candidatura técnica no constituye autorización de promoción, validación académica ni integración runtime. No se activó ninguno durante esta revisión.

Recomendación: conservar B1 como referencia identificada correctamente. Si se requiere Ridge de precio en la aplicación, definir qué versión y horizontes se incorporarán experimentalmente, con métricas propias y estado pendiente, sin presentarlo como ganador general.

## Funcionamiento de oferta

Archivo principal: `backend/src/services/forecast.service.ts`; features y loader en `backend/src/models/xm-gene-ridge-direct-v2/`.

- Fuente Gene/Sistema: generación agregada usada como aproximación de oferta, sin disponibilidad individual ni ofertas comerciales.
- 17 variables: rezagos por periodo hasta t−28, periodo 24 del origen, medias de 7/14 días, dispersión y calendario cíclico. Alcance calendario de hasta 29 días contando el origen; no confundirlo con las 672 observaciones de Chronos.
- Ridge estandarizado con medias y desviaciones congeladas, intercepto y coeficientes. Cada horizonte usa su propio artefacto; no se predice recursivamente un día a partir del resultado del anterior.
- Mezcla preparados compatibles, admite solapamientos idénticos y rechaza contradicciones. Registra artefactos fuente y no admite fuentes posteriores al origen.
- Loader contrasta identidad, parámetros, rangos y hash de corpus contra evidencia versionada. No entrena durante una consulta.
- Entrenamiento 01/10/2024..31/03/2026; validación 01/04..31/05/2026; holdout temporal 01/06..20/09/2026.
- WAPE registrado en holdout: h1 3,0689 %; h2 3,7985 %; h3 3,4663 %; h4 3,8405 %; h5 3,4963 %; h6 3,6657 %; h7 3,0725 %. Son métricas conservadas, no recalculadas en esta revisión.
- Estado de respuesta: experimental y validación académica pendiente. No publica intervalos probabilísticos calibrados.

## Funcionamiento de demanda

Archivos principales: `demand-v5-forecast.service.ts`, `demand-v5-origin.service.ts`, `demand-v5-features.ts` y loader `xm-demandasin-ridge-direct-v5/model-loader.ts`.

- Fuente DemaSIN diaria, distinta de DemaReal horaria utilizada por Chronos. No ofrece 24 valores horarios ni demanda por usuario o zona.
- 16 variables: nueve niveles retrasados, medias sobre últimas 7/14/28 observaciones utilizables, desviaciones de 7/14 y calendario semanal.
- Exige 28 observaciones utilizables dentro de 42 días y los rezagos puntuales requeridos; no imputa observaciones excluidas. Resuelve el último origen cerrado con vector coherente entre consolidado y preparados.
- La regla semántica propia marca caídas severas respecto de la mediana previa para revisión; no es una clasificación oficial de calidad de XM. Fechas excluidas observadas: 16/09, 28/09, 29/09 y 04/10.
- Modelos directos h1..h6, con scaler y parámetros congelados cotejados contra los frozen originales. Versión `hu06-demand-v5-c-primary@1.0.0`.
- Target estrictamente posterior a hoy Bogotá y a la última fecha recibida. La existencia de h1 no garantiza una fecha h1 futura cuando el origen es el día anterior o existe retraso.
- WAPE de VALIDATION técnica conservada: h1 2,2655 %; h2 3,8813 %; h3 3,7861 %; h4 3,8623 %; h5 3,6775 %; h6 3,8622 %. No son holdout ni validación prospectiva.
- Respuesta con `confidence: null`, estado experimental y `pendingProspectiveValidation`.

No comparar directamente sus MAE con los de Chronos horario: cambian fuente, agregación, fechas y protocolo. Tampoco clasificar modelos solo por WAPE obtenido en particiones diferentes.

## Comprobaciones y evidencia

Evidencia principal: `2026-10-21T07-24-07-793Z/audit.json`. Script: `backend/scripts/audit-ridge-runtime.ts`.

| ID | HU | Precondición y pasos | Esperado | Obtenido / estado |
|---|---|---|---|---|
| RR-01 | HU-04/06/08 | Leer disponibilidad con datos reales actuales | Reflejar restricciones y fuentes | Tres fuentes `SOURCE_DATA_STALE`; aprobado |
| RR-02 | HU-04 | Ejecutar oferta para 04/10 desde origen 03/10 | 24 periodos con Ridge V2 h1 | 24 predicciones; aprobado, histórico |
| RR-03 | HU-06 | Ejecutar demanda con reloj de prueba 06/10, target 07/10 y datos reales | Ridge V5 h4, origen 03/10 | 246.432.097,01925486 kWh; aprobado, histórico con reloj controlado |
| RR-04 | HU-08 | Ejecutar B1 para 06/10 con preparado real del 05/10 | 24 precios de referencia | 24 predicciones; aprobado, histórico |
| RR-05 | HU-15 | Solicitar 22/10 con los mismos datos | Rechazo controlado sin inventar contexto | Oferta/demanda 422 por horizonte; precio 422 por insuficiencia; aprobado |
| RR-06 | HU-05/07/18 | Cargar 7 artefactos oferta y 6 demanda y consultar métricas | Integridad y correspondencia de horizonte | Los 13 cargaron sin error; aprobado |

Regresión ejecutada: 186 pruebas aprobadas, 0 fallidas, 809 aserciones, siete archivos: `forecast.test.ts`, `demand-v5-runtime.test.ts`, `demand-v5-metrics.test.ts`, `price-forecast.test.ts`, `price-forecast-trace.test.ts`, `forecast-availability.test.ts`, `forecast-availability-coverage.test.ts`. Registro en `2026-10-21T07-24-07-793Z/tests.log`. El chequeo de tipos se ejecutó después de corregir un campo duplicado en el script de auditoría; no se modificó código productivo.

No se verificó HTTP/autenticación ni navegador en esta revisión. Las llamadas fueron directas a servicios y solo leyeron la base configurada. Las predicciones históricas no se registraron como emisiones prospectivas ni se puntuaron.

## Decisiones recomendadas antes de cambios gráficos

1. Recuperar actualización de fuentes, validación y preparación, y volver a comprobar fechas elegibles.
2. Corregir la identificación de versiones activas en catálogo y capacidades, manteniendo trazabilidad histórica.
3. Mantener explícita la diferencia entre demanda diaria Ridge y demanda horaria Chronos; una comparación justa requiere misma fuente, agregación, horizonte y fechas.
4. Resolver si se incorporará Ridge de precio como alternativa experimental concreta. No llamarlo activo mientras el endpoint siga siendo B1.
5. Recién entonces consolidar la interfaz alrededor de las capacidades realmente disponibles.

Observación adicional de contrato: oferta y B1 permiten consultas históricas directas si se satisfacen sus datos; demanda V5 exige un target futuro. La UI tradicional filtra fechas futuras en los tres casos. Debe aclararse si los endpoints soportan evaluación histórica o solo emisión operativa, sin confundir ambas actividades.

Apoyo de IA: ChatGPT/Codex asistió lectura de código, ejecución de comprobaciones y documentación. Este archivo es evidencia técnica de trabajo TG-II; no reemplaza la estructura oficial del informe ni cierra HU por sí solo.
