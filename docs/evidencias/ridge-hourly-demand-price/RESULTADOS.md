# Ridge horario de demanda y precio — integración

Fecha: 21/10/2026. Estado: implementado y probado localmente; experimental, sin validación prospectiva ni académica. [ADR-32](../../adr/ADR-32-ridge-demanda-precio-horarios.md).

## Uso en la aplicación

En **Demanda horaria experimental** o **Precio horario experimental**, seleccionar **Ridge horario experimental**, elegir una fecha elegible y consultar. Se muestran 24 predicciones, gráfica de referencia observada y pronóstico, origen, horizonte, versión, métricas específicas, tabla y evidencia. Chronos-2 y Bolt conservan sus opciones. Demanda diaria V5 y precio B1 siguen siendo capacidades separadas; no se transformaron sus resultados.

La línea observada corresponde al día completo de origen, mientras la otra es el pronóstico de la fecha futura seleccionada. No representa un backtest ni un valor real futuro. Ridge no devuelve cuantiles o intervalos probabilísticos.

## Modelos y datos

Demanda usa **DemaReal/Sistema** horario, excluye alumbrado público y no equivale a DemaSIN. Se ajustaron siete modelos directos, h1..h7, en un proceso offline. No se extendió recursivamente el Ridge h1 anterior. Se conservan protocolo, fuente, registro previo al ajuste, corpus hash, parámetros, selección y métricas en `demand-training/`.

Corpus: 26.304 periodos de 2023–2025, SHA-256 `e52819f935bb22c6d01cfd4546b23c192d6848ecd748c352d2c2e355881f4fa6`. Ajuste con targets hasta 31/12/2024 y contexto histórico disponible; validación 01/01..30/06/2025 (4.344 predicciones por horizonte). El inicio efectivo de entrenamiento depende del horizonte y de los 28 días previos requeridos. No se hicieron métricas finales sobre julio–diciembre ni una nueva afirmación de holdout desconocido: el corpus ya había sido inspeccionado en experimentos anteriores.

Variables en orden: demanda del mismo periodo en origen, origen−1/−6/−13/−27 días; periodo 24 de origen y origen−1; media últimas 24 y 168 horas; desviación poblacional últimas 168; seno/coseno del periodo, weekday y mes objetivo; indicador de fin de semana. Scaler ajustado solo con TRAIN. Grid alpha: 0,01/0,1/1/10/100/1000; mínimo MAE VALIDATION y después menor alpha. Modelos independientes y congelados; sin covariables, calibración, imputación ni recorte.

| h | Alpha | MAE VALIDATION kWh | RMSE VALIDATION kWh | WAPE % |
|---:|---:|---:|---:|---:|
| 1 | 100 | 215.888,69 | 313.094,45 | 2,3072 |
| 2 | 0,01 | 353.544,59 | 476.355,85 | 3,7784 |
| 3 | 0,01 | 391.944,00 | 515.936,38 | 4,1888 |
| 4 | 100 | 396.049,44 | 522.740,27 | 4,2326 |
| 5 | 100 | 392.023,67 | 515.412,96 | 4,1896 |
| 6 | 0,01 | 301.050,14 | 426.277,75 | 3,2174 |
| 7 | 0,01 | 304.563,71 | 432.334,86 | 3,2549 |

Estos valores proceden de VALIDATION técnica usada para seleccionar alpha; no son exactitud prospectiva ni resultado independiente de promoción. Las métricas de referencia del perfil observado en el origen también se conservan en cada JSON, sin selección posterior por test.

Precio usa **PrecBolsNaci/Sistema**, COP/kWh y los tres artefactos V1 originales h4/h5/h6. Se comprobó que parámetros, scaler, alpha y orden de variables coincidieran con `hu-08-price-multihorizon-v1/results.json` y que la candidatura técnica de esos horizontes fuese verdadera. No se reentrenó precio ni se promovió académicamente. Las features son exclusivamente precios históricos hasta origen y calendario; no se utilizan precios futuros ni forecasts de generación o demanda.

El loader valida SHA-256 de cada artefacto, identidad, dimensión y parámetros finitos, con desviaciones positivas. La inferencia runtime es una combinación lineal en JavaScript. No se añadieron paquetes al proyecto ni al entorno Python existente.

## Evidencia real

[verification.json](2026-10-21T08-20-35-407Z/verification.json) registra consultas HTTP con **adquisición real de XM y artefactos Ridge reales** para 22/10/2026:

| Variable | Origen completo | Modelo ejecutado | HTTP | Salidas |
|---|---|---|---:|---:|
| Demanda horaria | 18/10/2026 | xm-demareal-ridge-direct-h4-v1 | 200 | 24 |
| Precio horario | 18/10/2026 | xm-preciobolsnaci-ridge-direct-h4-v1 | 200 | 24 |

Se conservan disponibilidad y respuestas completas en esa carpeta. Los contextos, respuestas XM, catálogo capturado, normalización, hashes, salida y manifiesto quedan bajo `backend/data/chronos-forecasts/<executionId>`: demanda `aa7b2a54-a80d-4546-89e3-a9adbfdb511f`, precio `1dd5420a-6cab-43cc-ad32-f79ab5a93031`.

La autenticación se sustituyó únicamente en el listener temporal de prueba. No es comprobación de sesión real ni navegador. Las emisiones no se puntuaron ni se añadieron a journals prospectivos congelados. La diferencia respecto de la actualización anterior hasta el 17/10 refleja la publicación de un nuevo día completo en XM durante este trabajo; no una modificación manual de fechas.

## Pruebas

| ID | HU | Precondición / pasos | Esperado y obtenido | Estado |
|---|---|---|---|---|
| RHR-01 | HU-06/20 | Contexto real conservado y siete artefactos; comparar features y las 24 predicciones JS contra NumPy | Tolerancias 1e−7 en features y 1e−6 kWh en salidas, satisfechas | Aprobado |
| RHR-02 | HU-08/20 | Comparar features h4/h5/h6 con constructor original V1 | Coincidencia de las 15 features y misma evaluación histórica | Aprobado |
| RHR-03 | HU-15/18 | Alterar bytes, solicitar horizonte no soportado o contexto incompleto | Rechazo explícito antes de pronosticar | Aprobado |
| RHR-demand/price-04 | HU-06/08/14/15/20 | API local con fuentes sustituidas y artefactos reales, sin/con autorización de prueba | 401 sin acceso; 200 con 24 valores, unidad, métricas h5 y evidencia; pasado/campos extra/horizonte rechazados | Aprobado |
| RHUI-demand/price-01 | HU-06/08/14 | Interpretar contrato correcto y variantes corruptas | Rechazar unidad, identidad, horizonte, periodos o referencia incompatibles | Aprobado |
| RHUI-demand/price-02 | HU-06/08/20 | Renderizar componentes en servidor | Selector Ridge/Chronos, referencia y pronóstico, métricas propias y ausencia de cuantiles inventados | Aprobado |

La regresión inicial del backend dejó 148 aprobadas (4.715 aserciones) en seis archivos; registro [backend-tests.log](2026-10-21T08-20-35-407Z/backend-tests.log). Las comprobaciones posteriores de catálogo/versiones más Ridge dejaron 20 aprobadas (4.282 aserciones); contienen pruebas solapadas y no deben sumarse como casos distintos. Frontend completo: 236 aprobadas, 0 fallidas, 1.020 aserciones; [registro](2026-10-21T08-20-35-407Z/frontend-tests.log). Typecheck backend, build frontend y lint aprobados. La ejecución inicial de las pruebas desde staging falló por ruta de dependencias; se corrigió al directorio backend y la suite pasó. No fue un fallo del modelo.

El catálogo general ahora conserva 26 artefactos: 24 predictivos activos y dos legacy inactivos. Capacidades registra 26 identidades activas incluyendo los dos métodos existentes. Las diez identidades Ridge horarias nuevas tienen métricas por horizonte y `promoted=false`; los registros legacy y evidencias anteriores permanecen disponibles. Precio permite B1 determinista y Ridge ML con identificadores distintos.

## Límites y seguimiento

Pendientes: evaluación prospectiva por fuente/horizonte, comparación justa con Chronos usando las mismas fechas y orígenes, validación académica, sesión real, revisión visual manual y despliegue. El mecanismo de evidencia sigue siendo local; no equivale a integración relacional HU-17 completa. Un error o retraso de XM mantiene visibles los errores o la ausencia de fechas; no activa un fallback silencioso.

Esta evidencia es relevante para el informe TG-II y debe conservarse. No cierra por sí sola las HU. ChatGPT/Codex apoyó diseño, programación, ajuste offline, ejecución de pruebas y redacción; la revisión y sustentación corresponden al estudiante.
