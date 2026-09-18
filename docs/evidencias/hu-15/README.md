# Evidencia tecnica — HU-15: Manejar errores de servicios IA

## Estado

| Dimension | Estado |
| --- | --- |
| Backend HU-15 | Implementado |
| Pruebas tecnicas | Probado tecnicamente |
| Validacion academica/formal | Pendiente |
| Despliegue | Pendiente |

## Manejo implementado

Los errores de entrada, perfiles, modelos, datos insuficientes y fallos inesperados devuelven codigo y mensaje publico seguro. Los artefactos incompatibles usan `FORECAST_MODEL_INCOMPATIBLE`; los fallos inesperados de resultados IA usan `FORECAST_FAILED`, `MATCHING_OPERATION_FAILED` o `PATTERN_OPERATION_FAILED`, sin exponer secretos o detalles internos.

XM y NASA POWER conservan timeout real de 15 segundos mediante `AbortController`, con `504 EXTERNAL_TIMEOUT` y `504 NASA_POWER_TIMEOUT`. Las trazas `PriceForecastExecution`, `MatchingExecution` y `PatternAnalysis` son trazabilidad funcional, no logging tecnico.

Cada solicitud recibe `X-Request-Id` UUID interno. Solo los 500 inesperados de Forecast, Matching y Patterns escriben un evento JSON con timestamp, nivel, requestId, metodo, ruta, status, codigo seguro y nombre del error. No incluye cuerpos, queries, cookies, cabeceras, tokens, contrasenas, URL de base de datos, mensajes privados ni stack.

`GET /health` no requiere autenticacion. Con PostgreSQL disponible retorna `200 { status: "ok", service: "enertrade-backend", dependencies: { database: "ok" } }`; ante error o limite de 2 segundos retorna `503` con `database: "unavailable"`, sin detalles internos.

## Pruebas y validacion real

`observability.test.ts` ejecuta seis casos, 17 aserciones: UUID por solicitud, rechazo del ID enviado por cliente, 200 sano, 503 degradado, timeout inyectado, sanitizacion y logs de 500 para Forecast, Matching y Patterns; confirma que un 400 no genera log ERROR.

Se verifico `GET /health` con app y PostgreSQL reales: HTTP 200, `status=ok`, `database=ok` y `X-Request-Id` UUID valido. No se modificaron datos.

## Limitaciones

No hay proveedor externo de observabilidad, almacenamiento/retencion de logs, alertas, metricas operativas, endpoint readiness separado ni timeout cancelable para la consulta Prisma ya iniciada. Ver [ADR-19](../../adr/ADR-19-observabilidad-minima-api.md).