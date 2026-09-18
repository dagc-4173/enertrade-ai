# ADR-18 — Analisis deterministico de patrones

**Estado:** Aceptado para HU-12 y HU-13.

## Contexto

HU-12 requiere reconocer patrones en `PreparedDataset` y HU-13 consultar los resultados. Los perfiles verificables son XM Gene horario, XM DemaSIN diario y XM PrecioBolsNaci horario. No existe un corpus acreditado de Marketplace o `MatchingExecution` para este fin. Weather permanece fuera de los datasets energeticos conforme a ADR-15.

## Alternativas

### Analisis descriptivo deterministico

Calcula distribucion, tendencia lineal por observacion temporal ordenada y recurrencia por periodo horario o dia de semana. Es reproducible, explicable y no requiere entrenamiento.

### Clustering

Exige seleccionar variables, numero de grupos, metricas de estabilidad y un tamano de muestra justificado. No responde una necesidad v1 demostrada.

### Modelo de ML

Requeriria dataset, entrenamiento, metrica, version y evaluacion distintos de los modelos de pronostico existentes. No es necesario para patrones descriptivos.

### Correlacion multifuente

Requiere un contrato para alinear series diarias y horarias, procedencia y tratamiento de ausencias. No se implementa causalidad ni relaciones en v1.

## Decision

Se adopta `energy-pattern-descriptive@1.0.0`, un metodo estadistico determinista. Analiza exactamente un `PreparedDataset` compatible por llamada; no une artefactos. Produce `distribution` (count, min, max, mean, median y desviacion estandar muestral), `trend` (pendiente lineal y direccion) y `recurrence`.

La direccion es `stable` cuando $|slope| <= max(|value|, 1) * 10^{-12}$; de lo contrario es `increasing` o `decreasing` segun el signo. No expresa significancia estadistica. Las metricas se calculan con `number` JSON y suma compensada, sin redondeo o precision decorativa.

Una observacion permite distribucion y retorna `partial`; tendencia exige dos observaciones. Recurrencia solo publica grupos con al menos dos observaciones: `hora_xm`/`periodo` 1..24 para Gene/Precio y Monday-Sunday para DemaSIN. Cero observaciones retorna y persiste `no_results`.

`PatternAnalysis` conserva resultado, advertencias, metodo/version y FK restrictiva a `PreparedDataset`. `GET /patterns` filtra por interseccion del periodo: $periodStart <= to$ y $periodEnd >= from$; ordena por `createdAt DESC, id DESC`.

## Consecuencias y limitaciones

- No hay ML, clustering, anomalias, fraude, alertas, correlaciones ni causalidad.
- No se soportan `zone`, `user` ni RBAC; `requireAuth` autentica, pero no implementa roles.
- El resultado tecnico se devuelve con `persistence.failed` si falla el guardado; no se expone el error interno.
- Una serie anual no prueba estacionalidad multianual. Las descripciones son metricas observadas, no predicciones ni afirmaciones de estacionalidad.

## Trabajo futuro

Evaluar relaciones multifuente, datos marketplace historicos suficientes, politicas de retencion, RBAC y metodos adicionales solo con evidencia y una decision arquitectonica nueva.