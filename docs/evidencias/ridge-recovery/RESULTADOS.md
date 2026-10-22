# Recuperación de datos y alineación de Ridge

Fecha: 21/10/2026. Desarrollo TG-II. Estado: implementado y probado localmente; no desplegado ni validado académicamente. Continúa la [revisión funcional](../ridge-runtime-review/REVISION.md).

## Actualización real con XM

El proceso existente consultó XM, incorporó únicamente rangos nuevos, consolidó, validó y preparó las tres fuentes. No se alteraron modelos ni se extendieron artificialmente sus horizontes.

| Fuente | Rango incorporado | Filas nuevas | Último día recibido | Preparado | Validación |
|---|---|---:|---|---:|---|
| Gene | 04..17/10/2026 | 336 | 17/10 | 79 | Aprobado |
| DemaSIN | 05..18/10/2026 | 14 | 18/10 | 80 | Advertencia semántica |
| PrecBolsNaci | 06..17/10/2026 | 288 | 17/10 | 81 | Aprobado |

Evidencia: [antes](2026-10-21T07-31-42-495Z/before.json), [Gene](2026-10-21T07-31-42-495Z/Gene.json), [DemaSIN](2026-10-21T07-31-42-495Z/DemaSIN.json), [PrecBolsNaci](2026-10-21T07-31-42-495Z/PrecBolsNaci.json) y [después](2026-10-21T07-31-42-495Z/after.json). Los manifiestos 113, 114 y 115 y los preparados 79, 80 y 81 conservan la trazabilidad en la base del proyecto. La advertencia de demanda no se ocultó ni se convirtió artificialmente en aprobación.

La configuración local `XM_AUTO_SYNC_ENABLED` pasó a `true`. Su efecto automático comienza en el próximo inicio del backend, porque el scheduler consulta esa variable en el arranque. No se reinició ni se sustituyó el proceso de la aplicación durante este trabajo. La ejecución manual anterior sí se completó. Las credenciales y la configuración restante se conservaron sin publicarlas en la evidencia.

## Pronósticos futuros comprobados

Se ejecutaron los routers reales en un listener temporal local con Prisma y los preparados reales. No se inició el scheduler desde ese listener. No es una prueba de sesión autenticada ni de navegador.

| ID | HU | Solicitud | Esperado | Obtenido | Estado |
|---|---|---|---|---|---|
| REC-01 | HU-04/14/20 | Oferta 22/10 | HTTP 200, 24 periodos, identidad h5 | V2 h5, origen 17/10, 24 valores | Aprobado |
| REC-02 | HU-04/14/20 | Oferta 23/10 | HTTP 200, 24 periodos, identidad h6 | V2 h6, origen 17/10, 24 valores | Aprobado |
| REC-03 | HU-04/14/20 | Oferta 24/10 | HTTP 200, 24 periodos, identidad h7 | V2 h7, origen 17/10, 24 valores | Aprobado |
| REC-04 | HU-06/14/20 | Demanda 22/10 | HTTP 200, un total diario, identidad V5 | V5 h6, origen 16/10, un total diario | Aprobado |
| REC-05 | HU-08/15 | Consultar disponibilidad B1 futura | Sin fecha elegible si falta D−1 completo | Sin fecha elegible; último precio 17/10 | Aprobado como control de disponibilidad |
| REC-06 | HU-05/07/18 | Cotejar catálogo, versiones y métricas | Coincidencia por identidad y versión | 14 artefactos predictivos activos coincidentes; 2 históricos inactivos | Aprobado |

Evidencia principal: [verification.json](2026-10-21T07-36-02-386Z/verification.json), con cuatro respuestas de pronóstico completas, catálogo, capacidades y métricas en la misma carpeta. Las emisiones conservan fecha real, pero no se añadieron al journal prospectivo congelado ni se puntuaron. No acreditan precisión futura.

Demanda requiere distinguir la última observación individualmente utilizable (17/10) del último origen con todos sus rezagos utilizables (16/10). El día 18/10 se marcó para revisión semántica; los controles existentes de rezagos explican el horizonte h6 para el 22/10.

Precio B1 necesita los 24 precios del 21/10 para el objetivo 22/10. Como XM solo confirmó datos hasta el 17/10, permanece sin fecha futura. No se trató el precio del 17 como si fuera el del 21 ni se habilitó un modelo Ridge descartado para ocultar esa insuficiencia.

## Catálogo corregido

[ADR-31](../../adr/ADR-31-ridge-identidades-horizonte.md) documenta la decisión. Los loaders y artefactos no cambian: el catálogo ahora registra siete identidades V2 de oferta y seis V5 de demanda. Los Ridge legacy permanecen consultables con actividad falsa. Los tipos de evaluación siguen separados: holdout temporal para oferta y VALIDATION técnica para demanda V5. El precio tradicional continúa identificado como regla B1. Chronos conserva sus catálogos específicos.

## Calidad ejecutada

- Backend: 132 pruebas aprobadas, 0 fallidas, 645 aserciones en `model-catalog.test.ts`, `capability-versions.test.ts`, `demand-v5-runtime.test.ts`, `demand-v5-metrics.test.ts`, `forecast.test.ts` y `xm-daily-sync.test.ts`.
- Frontend: suite completa, 232 aprobadas, 0 fallidas, 986 aserciones, 21 archivos. [Registro](2026-10-21T07-36-02-386Z/frontend-tests.log).
- Backend: `bun run typecheck`, aprobado.
- Frontend: `bun run build` y `bun run lint`, aprobados.
- Revisión de espacios con `git diff --check`, sin errores; solo advertencias de conversión LF/CRLF.

No se hicieron cambios gráficos, entrenamiento, migraciones, commits ni despliegue. La revisión visual y la comprobación de la sesión real quedan pendientes.

## Próximo paso recomendado para precio Ridge

Conservar B1 como referencia y estudiar la incorporación explícitamente experimental de Precio V1 para h4/h5/h6, los horizontes con candidatura técnica retrospectiva en su evidencia existente. No presentarlo como solución general h1..h7 ni como validado prospectivamente. V4 continúa bajo su protocolo congelado. Antes de incorporarlo debe comprobarse la disponibilidad conjunta de variables y el contraste de identidad/métricas, igual que se hizo aquí con oferta y demanda. No se activó Ridge de precio como consecuencia de esta actualización de datos.

Este registro es evidencia importante para el informe TG-II y la trazabilidad HU→implementación→prueba→evidencia. No cierra por sí solo las HU. ChatGPT/Codex apoyó implementación, comprobaciones y documentación; la revisión y sustentación corresponden al estudiante.
