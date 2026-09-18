# HU17 - Trazabilidad de consultas IA

## Estado

**Implementado y probado de forma unitaria e integración PostgreSQL.**

## Implementación

`AiQueryTrace` registra el uso de las rutas de pronósticos, métricas, catálogo de modelos, matching y patrones. Conserva el `requestId` de `X-Request-Id`, duración, solicitante (`system` o usuario autenticado), endpoint lógico, capacidad, parámetros permitidos, versión o método disponible, estado (`succeeded`, `empty`, `failed`) y enlace opcional al artefacto funcional.

No persiste body/query sin filtrar, cabeceras, cookies, secretos ni snapshots de resultados. Las fallas de persistencia son no bloqueantes y generan el evento seguro `AUDIT_TRACE_PERSISTENCE_FAILED`.

## Prueba ejecutada

`bun test src/tests/ai-query-trace.test.ts`: 9 pruebas aprobadas, 0 fallos, 29 expectativas. Cubre correlación, parámetros permitidos, solicitantes, duración, estados, enlaces a recursos, errores 500 seguros y fallo best-effort.

Integración PostgreSQL ejecutada contra `GET /models`: HTTP 200, `requestId` `52e27776-ab4a-4d1d-a9a1-c51bb7d3bc63`, endpoint `/models`, estado `succeeded` y duración de 4 ms. Se eliminó la traza temporal `d18ddec1-8202-4112-94e7-33e9422200bb` al finalizar la comprobación.

## Evidencia a conservar

Migración `20260918152651_add_ai_query_trace`, resultado de la suite focalizada y una futura ejecución PostgreSQL con limpieza de los registros temporales.