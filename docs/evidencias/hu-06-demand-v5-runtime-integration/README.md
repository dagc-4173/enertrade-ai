# HU-06 Demanda V5: integración runtime controlada

## Baseline y estado

Baseline autorizado: `d1ff11af5ac0f6a4d5cbb5e68dbb166788c28f95`, árbol limpio al iniciar. Tag de preregistración `hu06-v5-preregistered`, commit `33ba66b508e6dca3516f94b04170f27be609f552`, cutoff `2026-10-01T19:02:43.949Z`. Los frozen originales, la preregistración y el journal prospectivo permanecen intactos. No hubo ajuste, selección nueva de alpha, scoring ni commit.

V5 se activa por autorización operativa explícita, no por cumplimiento demostrado de los criterios de promoción prospectiva. Conserva `modelStatus=experimental`, `academicValidation=pending`, `modelState=pendingProspectiveValidation`. No constituye validación académica ni resultado prospectivo suficiente para promover el modelo según el protocolo congelado.

## Artefactos y archivos

`backend/scripts/hu06-demand-v5-materialize-runtime.ts` proyecta únicamente los seis frozen h1..h6 a `backend/src/models/xm-demandasin-ridge-direct-hN-v5/1.0.0/model.json`. Conserva todos los campos salvo las listas extensas `trainingSourceProvenance` y `validationSourceProvenance`, que siguen disponibles en el frozen original. Añade `modelStatus=experimental` y `sourceFrozenSha256`. Repetirlo con archivos idénticos no cambia nada; diferencias existentes abortan sin sobrescribir.

El loader separado `backend/src/models/xm-demandasin-ridge-direct-v5/model-loader.ts` valida identidad, horizonte, 16 features en orden, parámetros finitos, scaler con desviaciones positivas, alpha/baseline, corpus, commit/tag/cutoff y estado. Coteja toda la proyección con el frozen original y congela profundamente el objeto. No utiliza alias ni fallback al loader V2. Los artefactos V2 y servicios legacy se conservan.

`backend/src/services/demand-v5-features.ts` es una fachada mínima del constructor preregistrado `buildV5Features()`, sin entrenamiento ni evaluación. `demand-v5-origin.service.ts` es el único resolver empleado por forecast y availability: fusiona preparados, rechaza duplicados contradictorios y discrepancias con el consolidado, exige origen cerrado en Bogotá y compara vectores/provenance de ambas fuentes. `demand-v5-forecast.service.ts` usa esa resolución, deriva horizonte desde origen y devuelve una sola predicción diaria con `sourceArtifacts`, `featureSourceDates`, `actualSourceDates`, `oldestDate`, `newestDate`, `count` y `calendarSpanDays`.

`forecast.controller.ts` conecta el POST normal de Demanda al servicio V5; `xm-daily-sync.service.ts` conecta solo su rama de disponibilidad DemaSIN al mismo resolver/loader. No se cambia sincronización, Oferta, Precio, frontend ni el contrato request `{targetDate}`. Se actualizan pruebas de sincronización y de preregistración/frozen para aceptar únicamente la materialización autorizada exacta, no promoción ni entrenamiento nuevo. Pruebas propias: `demand-v5-runtime.test.ts`.

## Features y elegibilidad

Niveles obligatorios: `t,t-1,t-2,t-6,t-7,t-13,t-14,t-27,t-28`. Estadísticas sobre últimas 7/14/28 observaciones USABLE, desviación poblacional de últimas 7/14, calendario seno/coseno del weekday target. Requiere 28 observaciones USABLE dentro de 42 días incluidos ambos extremos, no una ventana calendario continua. Ninguna fecha fuente posterior al origen; faltante/exclusión de un nivel puntual no se imputa. Target futuro no se consulta como input.

Origin debe ser anterior a la fecha Bogotá; target debe ser posterior a fecha Bogotá y `latestReceivedDate`. Por ello h1 desde el día anterior no es un target futuro aunque el modelo h1 exista; los tests cubren esta restricción. Availability verifica el artefacto y vector del horizonte antes de anunciarlo. Para un mismo estado de datos, las fechas anunciadas producen el mismo origen/horizonte/modelo en POST. No h7.

## Comprobación real

Verificado `2026-10-07T01:42:31.275Z` (06/10 en Bogotá) en servidor HTTP aislado de verificación con routers actuales y servicios Prisma reales. Se omitió autenticación únicamente en ese listener local de prueba; no se alteró autenticación productiva ni se inició `index.ts`/scheduler. El listener se cerró al terminar. No hubo sync manual ni modificación de datos.

Cobertura DemaSIN: recibido hasta 04/10, última observación individualmente utilizable 03/10, exclusiones 16/09, 28/09, 29/09 y 04/10. Se resolvieron 20 preparados compatibles; origen V5 más reciente 03/10. GET availability HTTP 200 anunció exactamente 07/10, 08/10 y 09/10.

| Target | h | HTTP POST | Modelo | Predicción kWh |
|---|---:|---:|---|---:|
| 2026-10-07 | 4 | 200 | xm-demandasin-ridge-direct-h4-v5 | 246432097.01925486 |
| 2026-10-08 | 5 | 200 | xm-demandasin-ridge-direct-h5-v5 | 248304263.8865202 |
| 2026-10-09 | 6 | 200 | xm-demandasin-ridge-direct-h6-v5 | 251616658.97361454 |

Versión `hu06-demand-v5-c-primary@1.0.0`; origen 03/10; unidad kWh; 28 fuentes estadísticas; span real 31 días. PreparedDataset 56/70/75, sourceDataset 152/202/212. Estas consultas de runtime no se anexaron al journal ni se puntuaron. POST 10/10 devolvió HTTP 422 `FORECAST_HORIZON_NOT_SUPPORTED`: desde origen 03/10 sería h7, no una cuarta fecha soportada.

## Pruebas y límites

19 pruebas específicas V5 runtime aprobadas, incluyendo loader, paridad exacta de features, semantic exclusions, ausencia de imputación, origen cerrado, preparado/consolidado coherentes, conflictos, metadata pendiente, missing-model sin fallback y coherencia HTTP availability/POST. Regresión backend: 957 pass, 0 fail, 17 casos filtrados que ajustan Ridge o evalúan experimentos históricos; se mantuvieron los demás casos de esos archivos. Typecheck aprobado.

Filtro ejecutado: `^(?!HU04-MH-V2 scaler|HU04-MH selection|Ridge dimensional equals|A uses six frozen features|V5 h|stored V3 results equal|HU06-MH scaler|HU08-MH-V2 scaler|HU08-MH-V3 scaler|HU08-MH scaler|V4 freezes alpha|paired retrospective quality)`.

El endpoint `/forecasts/demand/metrics` queda fuera de esta migración y sigue publicando métricas históricas identificadas como V2; no presentarlas como métricas V5. El frontend existente compara identidad y advierte el desajuste cuando muestra un resultado V5; no se cambió su código. Una futura migración de métricas V5 debe distinguir VALIDATION de validación prospectiva sin reutilizar métricas retrospectivas de V2/C. La autenticación/despliegue productivos no quedaron verificados por el listener local de prueba. h7 no implementado y validación prospectiva/académica pendiente.