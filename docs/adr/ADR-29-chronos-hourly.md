# ADR-29 Integración experimental de Chronos para demanda horaria

Estado: adoptado para este incremento autorizado. No implica promoción académica/productiva de los modelos.

## Contexto

DemaSIN activo es diario y usa Ridge. La evaluación independiente de DemaReal/Sistema (excluye alumbrado público) obtuvo mejoras retrospectivas con Chronos-Bolt Small y Chronos-2, contexto 672 y horizonte 24. La primera captura prospectiva encontró cinco días entre observación y objetivo. No hay evidencia de calibración prospectiva suficiente ni integración de ambos modelos en API.

## Alternativas

A: sustituir directamente el pronóstico diario por Chronos. Rechazada: cambia variable, resolución y contrato; confunde DemaSIN con DemaReal y afecta dependencias transaccionales.

B: servicio Python HTTP permanente. Aísla dependencias, pero añade servidor, autenticación, despliegue y monitoreo antes de demostrar necesidad.

C: API experimental dedicada, con proceso Python acotado por consulta. Reutiliza el entorno y checkpoints evaluados, sin otro servidor. Añade costo de carga por solicitud y requiere limitar concurrencia y tiempo.

## Decisión

Elegir C: catálogo y POST en `/forecasts/hourly-demand`, autenticados. Modelos elegibles Chronos-2 y Chronos-Bolt Small con revisiones/hashes fijados. Se mantiene el contrato diario y modelos actuales. El catálogo nuevo se declara experimental, no promovido; no se anuncia como modelo diario activo en catálogos existentes.

Adquisición reutiliza el capturador horario. Discovery consulta los últimos siete días terminados; contexto exige 28 días consecutivos. Generar periodos puente hasta la fecha futura; informar último dato, horizonte completo, puente y las 24 salidas objetivo. Máximo siete días desde el origen observado. Bolt puede requerir extensión más allá de sus 64 periodos nativos; se advierte explícitamente.

Una ejecución por proceso backend a la vez, timeout de inferencia 120 s, salida limitada, sin shell ni rutas enviadas por el usuario. Python y checkpoints se configuran solo en servidor. El worker opera offline, comprueba hashes y versión del paquete, valida entrada y cuantiles. No instala ni descarga modelos durante la consulta.

La evidencia local conserva solicitud, discovery, adquisición original/catalogada, salida completa, resultado y manifiesto con hashes. No se añade migración ni PreparedDataset artificial; las adquisiciones y resultados experimentales no se confunden con el pipeline diario. Las consultas nuevas no amplían aún la traza transversal Prisma: evidencia por ejecución local; HU-17 relacional pendiente para esta capacidad.

## Consecuencias y límites

Se necesitan directorio persistente y Python/checkpoints disponibles en el host del backend. Reinicios/múltiples instancias no comparten el bloqueo: no es una cola distribuida. La carga de pesos por consulta agrega latencia. No se asegura despliegue cloud por configurar un entorno local. El cliente puede cancelar su lectura; el proceso servidor queda acotado por timeout, no se promete cancelación inmediata de toda adquisición.

No hay caché ni uso de futuros observados, no se recalibran intervalos ni se activa matching/precio con DemaReal. La evaluación histórica H1 se muestra separada del horizonte efectivo. No afirmar que intervalos nominales tienen cobertura prospectiva validada. El estado académico sigue pendiente.

Trazabilidad: HU-01/02/03 adquisición experimental, HU-06/07 pronóstico/métricas, HU-14/15 contrato/errores, HU-18 revisión y HU-20 integración. No completa todas las HU.
