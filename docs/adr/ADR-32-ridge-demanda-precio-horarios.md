# ADR-32 — Ridge horario para demanda y precio

Estado: implementado y probado localmente; validación prospectiva y académica pendientes. Fecha: 21/10/2026.

## Contexto y alternativas

La comparación visual con oferta requería 24 periodos reales de pronóstico. Ridge V5 de demanda entrega un total diario DemaSIN y no puede desagregarse en 24 predicciones sin otro método. El Ridge DemaReal previo solo tenía evaluación h1, insuficiente ante retrasos de publicación. Precio operaba con B1 aunque había artefactos experimentales V1 candidatos en h4/h5/h6.

Se consideraron desagregar el total diario o aplicar recursión al modelo h1: ambas opciones alterarían el método evaluado. Se decidió incorporar modelos directos por horizonte sobre DemaReal, conservar V5 diario y añadir precio V1 únicamente en los tres horizontes respaldados por su evidencia técnica. No se reemplazan ni se declaran validados los métodos previos de TG-I.

## Decisión

- Demanda: nueva familia experimental `xm-demareal-ridge-direct-h{1..7}-v1`, 17 variables, 672 observaciones de contexto y un artefacto independiente por horizonte. Protocolo local fijado antes del ajuste, train 2023–2024 y VALIDATION enero–junio de 2025; alpha elegido solo por MAE de VALIDATION. El corpus ya había sido expuesto en trabajos previos; no se afirma un nuevo holdout desconocido ni una preregistración académica externa. No se evaluó el bloque final de test ni se utilizó para ajustar estos modelos.
- Precio: artefactos originales `xm-preciobolsnaci-ridge-direct-h{4,5,6}-v1`, sin reentrenamiento. Se cotejaron parámetros y variables contra los resultados V1 con candidatura técnica. Sus restricciones y datos originales permanecen intactos.
- Runtime: JavaScript aplica las features y la combinación lineal congelada; no ejecuta entrenamiento. Los archivos de modelo están fijados por SHA-256. Una prueba coteja las 24 salidas de cada horizonte de demanda con Python; otra coteja las features de precio con el experimento V1.
- Fuente: adquisición pública XM existente, con descubrimiento del último día completo y 28 días de contexto preservados en evidencia local. No hay imputación, datos posteriores al origen, recursión, recorte ni intervalos inventados.
- Contrato autenticado separado: GET `/forecasts/hourly-ridge/{demand|price}/availability`, POST `/forecasts/hourly-ridge/{demand|price}` con `{targetDate}`. Solo fechas futuras, máximo siete días desde hoy, y un horizonte con artefacto compatible desde el origen publicado.
- Interfaz: selector Ridge dentro de los paneles horarios existentes; selección de fechas elegibles desde el backend; gráfica de referencia observada en el origen y pronóstico objetivo, métricas por modelo/horizonte, tabla desplegable y trazabilidad. La referencia observada se identifica como otro día, sin presentarla como resultado real futuro. V5 diario y B1 siguen disponibles.
- Registro: el catálogo general incorpora las diez identidades nuevas, junto a sus métricas y estado experimental; el registro de capacidades admite Ridge ML y B1 dentro de precio, manteniendo identidades únicas.

## Consecuencias y límites

Las métricas de demanda son VALIDATION técnica; las de precio son holdout temporal retrospectivo ya existente. No deben compararse con métricas Chronos h1 obtenidas sobre otro horizonte o partición. Para comparar algoritmos se necesitan origen, fuente, target, horizonte y fechas comunes.

Los metadatos legacy de los JSON de precio dicen que eran artefactos offline; se conservan como evidencia histórica. La nueva integración es un envoltorio experimental, sin alterar esos archivos ni afirmar promoción del protocolo. Todo nuevo Ridge se anuncia con `promoted=false`, validación académica pendiente y sin confianza probabilística definida.

Se conservan entradas, salidas, identidad del modelo y hashes por consulta. La persistencia es evidencia local, no integración relacional HU-17 completa. La latencia y disponibilidad del proveedor siguen afectando las fechas elegibles. No se verificaron sesión real, revisión manual del navegador ni despliegue en esta tarea.

Trazabilidad: HU-06/07 (demanda), HU-08/09 (precio), HU-14/15 (API/errores), HU-18 (versionado), HU-20 (integración). No se declaran las HU cerradas por este ADR.
