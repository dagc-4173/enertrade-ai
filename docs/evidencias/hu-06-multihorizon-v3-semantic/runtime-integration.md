# HU-06: integración runtime D+1..D+6

Baseline: `1b3a93c` (main limpio). Fuente de parámetros: `results.json` de la reevaluación semántica, familia V2. Los archivos `backend/src/models/xm-demandasin-ridge-direct-h{1..6}-v2/1.0.0/model.json` se generan exclusivamente por proyección de `fittedParameters`, métricas y rangos ya guardados mediante `bun scripts/hu06-materialize-direct.ts`. No se ejecuta `fitRidgeV2`, no se ajusta alpha y no se genera h7. El loader coteja cada artefacto con la evidencia congelada antes de usarlo.

| Horizonte | Modelo | Alpha | Estado |
|---:|---|---:|---|
| 1 | xm-demandasin-ridge-direct-h1-v2 | 0.01 | experimental, academicValidation=pending |
| 2 | xm-demandasin-ridge-direct-h2-v2 | 10 | experimental, academicValidation=pending |
| 3 | xm-demandasin-ridge-direct-h3-v2 | 10 | experimental, academicValidation=pending |
| 4 | xm-demandasin-ridge-direct-h4-v2 | 10 | experimental, academicValidation=pending |
| 5 | xm-demandasin-ridge-direct-h5-v2 | 10 | experimental, academicValidation=pending |
| 6 | xm-demandasin-ridge-direct-h6-v2 | 10 | experimental, academicValidation=pending |

El modelo anterior `xm-demandasin-ridge@1.0.0` permanece en repositorio y sus pruebas siguen ejecutándose mediante inyección explícita. El nuevo h1 lo reemplaza en la ruta normal como candidato técnico, **no** como validación académica; no existe fallback implícito al legacy. Si falta un artefacto h solicitado, se rechaza. h7 sigue pendiente/no soportado.

La petición normal `POST /forecasts/demand` acepta exclusivamente `{ "targetDate": "YYYY-MM-DD" }`. Datasets preparados con perfil compatible se fusionan de forma determinista: duplicados idénticos comparten procedencia y valores en conflicto producen `PREPARED_DATASET_INCONSISTENT`. El origen es la fecha observada más reciente que satisface los 28 días de features V2 y `isDemandForecastSampleEligible()` sobre origen y todas las fechas fuente. Nunca se consulta el target como observación ni se imputan fechas faltantes. La disponibilidad conserva explícitamente `eligibleFutureTargetDates`, con h1..h6 y exclusiones semánticas. `GET /forecasts/demand/metrics?horizonDays=N` expone la evaluación retrospectiva congelada, no una validación prospectiva.

## Validación real (2026-10-01)

`GET /health`: HTTP 200, base de datos OK. `GET /forecast-availability` sin sesión: HTTP 401 (ruta protegida). El servicio de disponibilidad ejecutado en lectura sobre los mismos datos persistidos informó última fecha recibida 2026-09-29, última observación individualmente utilizable 2026-09-27, revisión semántica 2026-09-16/28/29 y `eligibleFutureTargetDates=[]`. La auditoría de 19 preparados compatibles fusionó 1.156 fechas sin conflicto; el último origen con rolling íntegro fue 2026-09-15. No se ejecutó predicción real porque no hay un target futuro h1..h6 elegible. La evaluación 2026-06-01..2026-09-29 es retrospectiva técnica y no constituye holdout virgen ni validación académica.