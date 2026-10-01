# HU-06 Demanda V4: preregistración técnica

**Estado: `pendingExperiment`.** Corte: `2026-10-01T18:37:55.275Z`. Baseline del diseño: `4f8a24c`. No hay entrenamiento, evaluación de holdout, artefactos V4 ni ruta runtime V4.

## Hipótesis y alcance

Una familia Ridge directa e independiente h1..h6 basada en observaciones puntuales `USABLE` podría recuperar orígenes recientes después de huecos semánticos aislados sin imputación, recursión ni fallback. h7 queda fuera. A es la **única variante primaria**; B conserva V2 continuo como comparador y C estudia estadísticas de observaciones utilizables como comparador separado. La ablación target-relative no se incorpora a A por mostrar mejores resultados: requeriría una versión/protocolo nuevo para optar a promoción.

El [manifiesto](manifest.json) congela features, corpus, particiones, selección, baselines, umbrales, caso operativo y limitaciones. El [protocolo](protocol.md) define la construcción y evaluación futura. El CSV original permanece íntegro, incluidas las fechas 16/09, 28/09 y 29/09; la exclusión se aplica por la política semántica existente.

## Capacidad observada, no pronósticos

Al 01/10/2026 la última fecha recibida es 29/09 y la última individualmente utilizable es 27/09. Para `t=27/09`, A y C pueden construir inputs; B no, porque su rolling de 14/28 días contiene 16/09. Los targets calendáricos h1..h6 son 28/09, 29/09, 30/09, 01/10, 02/10 y 03/10. Solo h5/h6 serían futuros respecto al 01/10, pero **no hay modelo V4 entrenado que los pronostique**. 28/09 y 29/09 son observaciones recibidas en revisión semántica: no deben utilizarse como inputs.

Para orígenes 17..27/09, A construye 10/11 (todos salvo 22/09), B 0/11 y C 7/11 (19..21 y 24..27/09). Son recuentos de **inputs construibles**, no de aciertos ni de predicciones. Un lag puntual excluido sigue bloqueando A o C; C no usa 16/09 en las estadísticas.

Los modelos directos V2 existentes y el frontend permanecen sin cambios. La evaluación retrospectiva previa no equivale a validación académica, holdout virgen ni prueba prospectiva.