# HU16 - Procesamiento asíncrono de predicciones

## Estado

**NO APLICA AL PROTOTIPO ACTUAL.**

## Evidencia técnica

Las rutas vigentes de pronóstico, matching, patrones, catálogo y métricas procesan solicitudes de forma síncrona mediante Express y Prisma. El repositorio no contiene broker, cola, worker ni contrato de trabajo asíncrono.

La observabilidad de las solicitudes síncronas se cubre mediante `X-Request-Id`, logging seguro de errores inesperados y el endpoint `GET /health` de HU15. La trazabilidad de uso IA se registra en HU17 sin introducir infraestructura asíncrona.

## Condición de reapertura

La HU requiere revisión cuando exista una operación cuyo tiempo, volumen o ejecución diferida necesite un contrato explícito de encolamiento, estado y reintento. No hay evidencia de esa necesidad en el prototipo actual.