# Integración Chronos — oferta y precio

Se amplía ADR-29 mediante [ADR-30](../../adr/ADR-30-chronos-oferta-precio.md). Ambos modelos están incorporados localmente en backend y frontend para las tres variables. Esto no acredita validación académica ni despliegue.

| Variable | Ruta base | Fuente | Unidad | Métricas en este recorrido |
|---|---|---|---|---|
| Oferta | `/forecasts/hourly-supply` | Gene/Sistema | kWh | Pendientes |
| Demanda | `/forecasts/hourly-demand` | DemaReal/Sistema | kWh | Comparación retrospectiva existente |
| Precio | `/forecasts/hourly-price` | PrecBolsNaci/Sistema | COP/kWh | Pendientes |

Cada ruta permite GET `/models` y POST `{ "model": "chronos2", "targetDate": "AAAA-MM-DD" }`; también acepta `bolt`. Requiere autenticación. Las rutas anteriores Ridge/B1 permanecen disponibles.

Contexto: 28 días completos; día objetivo futuro, dentro de los próximos siete días y a no más de siete días del último dato completo. Respuesta: 24 periodos con q10/q50/q90, origen, horizonte efectivo, periodos intermedios, versión y evidencia local. Los cuantiles no están calibrados prospectivamente. Oferta representa generación agregada como aproximación; precio es referencia de bolsa. No se afirma balance ni dependencia causal entre los tres pronósticos.

## Reproducción

Desde backend, `bun scripts/chronos-market-integration.ts RUTA_CATALOGO_XM_CAPTURADO_JSON`, con las mismas variables `CHRONOS_*` descritas en la evidencia de demanda. Usa el corpus histórico real conservado en `hu-08-price-multihorizon-v3-exogenous`, conserva su SHA-256 y reconstruye respuestas con forma XM para ejercitar los adaptadores. El catálogo sí corresponde a una captura conservada. Usa reloj histórico controlado, inferencia Python real y autenticación sustituida exclusivamente en el script. No accede a Prisma ni a XM en vivo, y no calcula métricas.

La carpeta de cada ejecución conserva cuatro respuestas y `verification.json`; los archivos de entrada, salida y hashes completos quedan en `backend/data/chronos-forecasts/<executionId>`. Los JSON de entradas reconstruidas son fixtures de integración, no respuestas originales de XM. No usar sus marcas de adquisición como evidencia de publicación histórica.

## Pruebas y criterios

| ID | HU | Precondición y pasos | Resultado esperado | Evidencia |
|---|---|---|---|---|
| CHM-supply/price-01 | HU-02, HU-04, HU-08 | Normalizar fixtures completos y luego métrica incorrecta, día ausente y periodo extra | Aceptar solo calendario y métrica correctos | `chronos-market.test.ts` |
| CHM-supply/price-02 | HU-04, HU-08, HU-14, HU-18, HU-20 | Consultar sin autenticación; ejecutar ambos modelos con adaptadores y trabajador sustituidos | 401 sin acceso; 200 con 24 periodos, unidad propia, origen y hashes; métricas nulas | `chronos-market.test.ts` |
| CHM-03 | HU-02, HU-15 | Catálogo incompatible | Rechazo anterior a inferencia | `chronos-market.test.ts` |
| CHM-04 | HU-02, HU-08 | Precio negativo y generación negativa | Preservar precio; rechazar generación | `chronos-market.test.ts` |
| CHMF-supply/price | HU-04, HU-08, HU-20 | Interpretar respuesta y renderizar componentes en servidor | Dos modelos, unidades propias, aviso de evaluación pendiente; rechazo de unidad o variable incorrecta | `frontend/tests/chronos-market.test.tsx` |
| CHM-REAL-WORKER-01 | HU-04, HU-08, HU-18, HU-20 | Ejecutar el script con corpus histórico, catálogo capturado y checkpoints configurados | Cuatro HTTP 200, 24 periodos por combinación y unidades correctas | Carpeta con `verification.json` |

El registro de resultados ejecutados se conserva en RESULTADOS.md. Las pruebas automatizadas de componentes no sustituyen una revisión visual en navegador. Las pruebas con autenticación sustituida no acreditan una sesión real.
