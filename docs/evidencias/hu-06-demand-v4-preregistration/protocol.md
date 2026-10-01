# Protocolo HU-06 Demanda V4 (`pendingExperiment`)

## Congelación y datos

Corte de preregistración `2026-10-01T18:37:55.275Z`. El snapshot histórico es `docs/evidencias/hu-06-multihorizon/corpus/xm-demandasin-2024-01-01_2026-09-29.csv`, SHA-256 `18fd5aad3fe12eaa5290dba9ea551ccaef1a2baf4f41febf0c0354f0252c1735`, 1003 observaciones. TRAIN 2024-02-04..2026-03-31; VALIDATION 2026-04-01..2026-05-31; RETROSPECTIVE EVALUATION 2026-06-01..2026-09-29. Esta última partición fue observada antes de diseñar la política semántica: **no** es un external holdout virgen ni puede seleccionar features, alpha o baseline.

Se conserva `demandasin_severe_drop_vs_trailing_median_v1` sin cambios. El evaluador se ejecuta cronológicamente sobre el corpus completo sin borrar las observaciones en revisión. Para inferencia se comprueban origen y **todas** las fechas fuente con `isDemandForecastSampleEligible()`; `targetDate` no se requiere como observación. Para métricas históricas sí se exige target `USABLE`. Siempre `sourceDate <= forecastOriginDate`. Falta o exclusión de una fuente obligatoria implica muestra inelegible; nunca se imputa, reinterpreta un lag, usa forecast recursivo ni cae a otro horizonte.

## Hipótesis preregistradas

**A primaria:** cuatro niveles `demand(t)`, `demand(t-6)`, `demand(t-13)`, `demand(t-27)` en ese orden y después seno/coseno del weekday calendario del target. Ninguna estadística rolling. Los seis modelos h1..h6 son independientes y predicen directamente `demanda_kwh(t+h)`.

**B comparador:** las 16 features actuales V2, incluidos niveles `t,t-1,t-2,t-6,t-7,t-13,t-14,t-27,t-28`, medias completas 7/14/28 y desviaciones poblacionales completas 7/14. No cambiar los artefactos V2 actuales.

**C comparador independiente:** mismos nueve niveles puntuales obligatorios de B, con medias sobre las últimas 7, 14 y 28 observaciones individualmente `USABLE` y desviaciones poblacionales sobre las últimas 7 y 14. Se exige exactamente N=28 observaciones utilizables dentro de los últimos 42 días calendario **incluido t**. Seleccionar cronológicamente las 28 más recientes; no rellenar fechas faltantes ni usar observaciones posteriores a t. Registrar lista de fechas reales y amplitud calendario (desde la más antigua hasta t, ambos inclusivos). Una exclusión de un nivel puntual sigue invalidando C. Estas estadísticas no representan ventanas calendario continuas: el tiempo cubierto varía y debe informarse en calidad y cobertura.

**Ablación separada A+target-relative:** agregar `target-7`, `target-14`, `target-21`, `target-28` a A únicamente si las cuatro fechas están `<=t` y `USABLE`. Puede reducir cobertura según h. Sus resultados son diagnósticos: no mezclarla, escogerla ni promoverla en lugar de A tras observar desempeño sin registrar una nueva versión prospectiva.

## Selección futura, sin ejecución en esta tarea

Cuando se autorice un experimento posterior, comprobar primero identidad del CSV y reproducibilidad del vector. Ajustar Ridge directo por horizonte solo con TRAIN elegible; scaler calculado solo en TRAIN. Alpha grid `[0.01, 0.1, 1, 10, 100]`, elegir con VALIDATION por menor MAE, desempatar RMSE y alpha menor. Baselines congelados: `B_ORIGIN`, `B_ORIGIN_MINUS_6` y `B_TRAIN_TARGET_WEEKDAY_MEAN` (media calculada exclusivamente en TRAIN). Seleccionar referencia con VALIDATION por MAE, luego RMSE y finalmente ID lexicográfico. No introducir nuevas features o cambiar variantes, baselines o reglas tras consultar evaluación: eso exige versión nueva.

Calidad y cobertura se reportan **por separado y por horizonte**. Cobertura: muestras elegibles, orígenes construibles, targets futuros construibles y causas de no disponibilidad. Calidad: MAE, RMSE, Bias, WAPE, evaluable/unavailable y máximo error, sobre conjuntos identificados. Comparar A con V2 también en las **mismas parejas origen/target** y reportar el tamaño del conjunto; no declarar mejora por tener más fechas. El bloque retrospectivo conocido puede describirse, pero no elegir variantes ni validar prospectivamente.

## Criterios antes de reemplazar V2

Requiere simultáneamente: mejora MAE >=1% contra el baseline seleccionado; WAPE no peor; parámetros y métricas finitos; unavailable atribuible al modelo = 0; máximo error <=10 veces la desviación estándar muestral de targets TRAIN elegibles; cero leakage. Para sustituir V2 en un horizonte: al menos un origen **y** un target futuro adicional construibles sobre un snapshot común; al menos 30 target days elegibles emparejados para comparación; MAE emparejado A <=1.05 x MAE V2 y WAPE emparejado A <=1.05 x WAPE V2. "No degradar materialmente" significa ambos límites del 5%, no un juicio posterior. Exigir además 60 target days prospectivos completos por horizonte antes de una decisión de reemplazo runtime; sin evidencia suficiente el estado permanece pendiente. Los umbrales no garantizan potencia estadística universal ni validación académica.

## Caso de capacidad fijado

Al 01/10/2026, `t=2026-09-27` tiene A construible, B no construible y C construible sin target observado como input. h1→28/09; h2→29/09; h3→30/09; h4→01/10; h5→02/10; h6→03/10. Solo h5 y h6 son futuros respecto al 01/10. Ninguno constituye una predicción V4: no hay ajuste ni despliegue. Conservar la procedencia y las exclusiones 16/28/29 al ejecutar pruebas futuras.