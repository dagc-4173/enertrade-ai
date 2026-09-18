# ADR-19 — Observabilidad minima de la API

**Estado:** Aceptado para HU-15.

## Contexto

Los controladores de EnerTrade AI devuelven errores funcionales seguros, pero no existia una forma transversal de correlacionar una solicitud con un fallo inesperado del servidor ni un endpoint de estado para monitoreo basico.

## Alternativas

- No agregar observabilidad: conserva simplicidad, pero impide diagnostico operacional minimo.
- Proveedor externo: ofrece capacidades amplias, pero agrega dependencias, configuracion y alcance no justificado.
- Logging estructurado interno y health: cubre correlacion y disponibilidad con dependencias actuales.
- Plataforma completa de observabilidad: excede el MVP.

## Decision

Cada solicitud recibe un UUID generado internamente y expuesto solo en `X-Request-Id`; no se confia en el identificador enviado por el cliente. Los cuerpos de respuesta existentes no cambian.

Los handlers de error inesperado 500 de Forecast, Matching y Patterns emiten un evento JSON seguro con `timestamp`, `level`, `requestId`, metodo, ruta, status, codigo publico y nombre del error. No registra cuerpos, query, cookies, cabeceras, tokens, contrasenas, URLs de base de datos, mensajes arbitrarios ni stack.

`GET /health` es sin autenticacion y comprueba PostgreSQL mediante `SELECT 1` con presupuesto de 2 segundos. Responde `200` con `status: ok` y `database: ok`, o `503` con `status: degraded` y `database: unavailable`, sin detalles de infraestructura.

## Consecuencias y limitaciones

- Logging tecnico y trazabilidad funcional no son equivalentes: `PriceForecastExecution`, `MatchingExecution` y `PatternAnalysis` mantienen su proposito propio.
- Los 4xx, 401, 404, `no_matches`, `no_results` y `persistence.failed` no generan log de error.
- No hay proveedor externo, retencion, agregacion, metricas operativas, alertas ni timeout cancelable de la consulta Prisma subyacente.
- Los timeouts de 15 segundos de XM y NASA POWER permanecen sin cambios.

## Trabajo futuro

Evaluar retencion y transporte de logs, metricas, readiness dedicada, trazas distribuidas y correlacion ampliada solo si existe una necesidad operativa demostrada.