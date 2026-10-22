# ADR-30 — Chronos para oferta, demanda y precio

Estado: implementado localmente; evaluación por variable y validación académica pendientes.

## Contexto

La integración de ADR-29 solo cubría demanda horaria DemaReal. El estudiante solicitó incorporar ambos modelos también en oferta y precio. Se conserva la semántica de TG-I: Gene/Sistema es generación agregada utilizada como aproximación de oferta; PrecBolsNaci/Sistema es precio de bolsa nacional de referencia. Ninguna de estas variables representa una publicación individual del marketplace.

## Alternativas

1. Reemplazar Ridge y B1: perdería la línea base y requeriría evidencia comparativa antes de promover los modelos.
2. Duplicar servicios y trabajadores por variable: aumenta el riesgo de diferencias en versiones, límites y trazabilidad.
3. Compartir el trabajador y el servicio de inferencia, con adaptadores, contratos, unidades y evaluación por variable: conserva el comportamiento anterior y permite contrastar los modelos.

## Decisión y justificación

Se adopta la tercera alternativa, con Chronos-2 y Chronos-Bolt Small en tres rutas autenticadas: `/forecasts/hourly-supply`, `/forecasts/hourly-demand` y `/forecasts/hourly-price`. Cada ruta tiene catálogo `/models` y solicitud POST `{model,targetDate}`. Oferta usa Gene en kWh, demanda DemaReal en kWh y precio PrecBolsNaci en COP/kWh.

El contexto exige 672 periodos completos y ordenados. Se preservan los periodos XM 1..24, sin inferir timestamps. El horizonte se mide desde el último día completo publicado y no puede superar siete días. Se generan los periodos intermedios y se muestran los 24 del día objetivo. El catálogo de XM debe mantener métrica, entidad, unidad y resolución esperadas; la adquisición conserva respuestas, normalización y hashes.

Se reutilizan los checkpoints y versiones verificados por ADR-29. No se entrena ni se ajusta el modelo. Un único límite de ejecución compartido entre las tres rutas evita procesos simultáneos de inferencia en esta instancia. El trabajador admite valores finitos negativos para permitir precios negativos; los adaptadores de energía conservan su rechazo de valores negativos. No se recortan las predicciones.

## Consecuencias y pendientes

- Ambas opciones aparecen en los tres paneles experimentales. Ridge y B1 siguen disponibles.
- Las métricas de demanda solo se muestran en demanda. Oferta y precio devuelven `historicalMetrics: null` y `pending_series_evaluation`; la evidencia previa de Chronos-2 en Gene no se atribuye a Bolt ni se traslada automáticamente al nuevo recorrido.
- Son tres inferencias univariantes independientes. No se impone balance oferta-demanda ni se afirma que el precio se calcule causalmente a partir de las otras dos variables.
- Se conserva evidencia local por ejecución y variable. La integración relacional de HU-17, despliegue, sesión real y revisión visual en navegador siguen pendientes.
- La prueba con datos históricos y reloj controlado verifica integración e inferencia; no mide exactitud ni acredita acceso actual a XM. Cada variable requiere evaluación temporal propia y seguimiento prospectivo antes de promoverse.
- La configuración local sigue usando las mismas variables `CHRONOS_*`; no hay migración ni dependencias nuevas.

Trazabilidad: HU-04/05 (oferta), HU-06/07 (demanda), HU-08/09 (precio), HU-14/15 (API y errores), HU-18 (versiones), HU-20 (integración). Estas referencias no declaran las HU completadas.

Apoyo de IA: ChatGPT/Codex asistió el diseño, la implementación, las pruebas y esta documentación. La revisión y sustentación académica corresponden al estudiante.
