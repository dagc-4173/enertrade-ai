# Disponibilidad futura XM: HU-04, HU-06 y HU-08

`GET /forecast-availability` conserva autenticacion por cookie y los campos
anteriores. No sincroniza XM, no crea preparados ni ejecuta inferencia.

## Candidatos y construibilidad

El limite del producto es siete dias desde la fecha actual. Los candidatos son
`currentDate + 1` hasta `currentDate + min(7, modelMaxHorizonDays)`.
Un candidato no constituye una promesa de prediccion: se filtra con el contrato
real del runtime.

| Serie | Horizonte del modelo | Validacion de construibilidad |
| --- | --- | --- |
| Gene | h1..h7, Ridge directo V2 | Origen `coverage.persistedUntil`, horizonte desde ese origen, modelo compatible y features reales de los 24 periodos sobre preparados compatibles fusionados. |
| DemaSIN | h1..h6, Ridge directo V5 | `resolveDemandV5Origin`, origen cerrado anterior a hoy, modelo compatible y `buildResolvedDemandV5Target` con las features V5 y exclusiones semanticas existentes. |
| PrecBolsNaci | 1 dia, regla B1 | Un solo candidato: manana. D-1 debe existir en un mismo preparado compatible con 24 periodos unicos, precios finitos y procedencia valida. |

No se desplaza artificialmente el origen hasta hoy ni se usa una prediccion como
observacion. No se implementa h7 de Demanda.

Con fecha actual `2026-10-08`, los candidatos son:

- Gene: `2026-10-09..2026-10-15`.
- DemaSIN: `2026-10-09..2026-10-14`.
- Precio: `2026-10-09`.

Gene puede habilitar los siete con un origen completo del 08/10. Con origen del
04/10, solo 09..11 respetan h1..h7 desde el origen real. V5 no puede habilitar los
seis futuros manteniendo su contrato de origen cerrado: con origen del 07/10,
solo 09..13 caben en h1..h6; el 14 requiere h7 desde ese origen. Esta restriccion
se preserva expresamente.

## Respuesta

Campos adicionales:

- `modelMaxHorizonDays`: 7, 6 o 1 segun la serie.
- `productMaxHorizonDays`: 7.
- `candidateFutureTargetDates`: lista ordenada anterior al filtro.
- `availabilityReason`: razon agregada de la disponibilidad.
- `eligiblePreparedDatasetIds`: solo para Precio; preparados con D-1 completo,
  para evitar seleccionar un artefacto antiguo aunque otro permita el target.

`eligibleFutureTargetDates` es el subconjunto ordenado construible.
`hasFutureForecastWindow` equivale a que ese subconjunto no este vacio.
`effectiveFutureMinDate` y `effectiveFutureMaxDate` son su primera y ultima fecha
o `null`. No implican que todas las fechas intermedias sean elegibles.
`modelMinTargetDate` y `modelMaxTargetDate` conservan su significado respecto al
origen real, no al calendario del producto. `latestObservationDate` conserva
la cobertura existente; no se reemplaza por `currentDate`.

| availabilityReason | Significado |
| --- | --- |
| AVAILABLE | Existe al menos una fecha construible; no garantiza todos los candidatos. |
| SOURCE_DATA_STALE | Los datos fuente no alcanzan fechas futuras dentro del horizonte desde el origen real. |
| INCOMPLETE_SOURCE_DAY | B1 encuentra D-1, pero ningun preparado lo contiene completo y valido. |
| NO_BUILDABLE_ORIGIN | No hay origen/features preparados construibles. |
| MODEL_HORIZON_LIMIT | El cargador no confirma un modelo compatible para los horizontes requeridos. |

Las inconsistencias conocidas entre preparados se informan como error de su
metrica, sin descartar las otras. Los errores inesperados/estructurales y de DB
siguen propagandose al manejador de errores de la API. B1 informa expresamente
la indisponibilidad del dia fuente invalido/incompleto; nunca fabrica un fallback.

El frontend acepta respuestas anteriores sin los campos nuevos, valida los
limites en ambos contratos y ofrece un selector discreto de fechas elegibles
para las tres series. Un input nativo de fecha con solo min/max permitiria
huecos no construibles. El horizonte seleccionado Ridge se cuenta desde el
origen; B1 siempre muestra un dia.

## Validacion reproducible sin datos reales ni escrituras

Las pruebas usan fixtures sinteticas exclusivamente aisladas; no se registran
como datos XM ni se usan para afirmar disponibilidad real de Neon.

- `backend/src/tests/forecast-availability.test.ts`: fecha fija 08/10/2026,
  limites del producto, origen atrasado, modelos ausentes, features faltantes,
  origen V5 cerrado/semanticamente excluido y B1 completo, ausente, incompleto,
  duplicado, invalido o repartido entre artefactos.
- `backend/src/tests/xm-daily-sync.test.ts`: regresion del pipeline mock.
- `backend/src/tests/forecast.test.ts`, `demand-v5-runtime.test.ts` y
  `price-forecast.test.ts`: contratos existentes de inferencia en mocks.
- `frontend/tests/forecast.test.tsx` y `prepared-datasets.test.tsx`: respuesta,
  seleccion discreta, huecos, limites y filtrado de preparados.

No cambia modelos, versiones, features, metricas historicas, fuentes de datos,
contenido de datasets, sincronizacion ni contratos POST de inferencia.

## Evidencia ejecutada el 2026-10-08

| ID | HU | Precondicion y pasos | Esperado | Obtenido / estado |
| --- | --- | --- | --- | --- |
| AV-GENE-01 | HU-04 | Fixture aislada con origen 08/10 y features completas; consultar disponibilidad con fecha fija 08/10. | Elegibles 09..15; sin inferencia ni escritura. | Coincide; probado. |
| AV-GENE-02 | HU-04 | Fixture con origen 04/10; consultar disponibilidad con fecha fija 08/10. | Candidatos 09..15; elegibles 09..11 por h5..h7 desde el origen. | Coincide; probado. |
| AV-DEMAND-01 | HU-06 | Fixture V5 completa, fecha fija 08/10, origen cerrado 07/10. | Seis candidatos; elegibles 09..13, no h7. | Coincide; probado. |
| AV-DEMAND-02 | HU-06 | Excluir semanticamente el 07/10 en fixture V5. | Origen 06/10; elegibles 09..12. | Coincide; probado. |
| AV-PRICE-01 | HU-08 | Fixture B1 con 24 periodos del 08/10 en un preparado. | Solo 09/10 y el ID preparado construible. | Coincide; probado. |
| AV-PRICE-02 | HU-08 | D-1 ausente, incompleto, duplicado, invalido o dividido entre preparados aislados. | Sin elegibles y motivo concreto. | Coincide; probado. |
| AV-UI-01 | HU-04 / HU-06 / HU-08 | Renderizar selector con fechas elegibles discontinuas y filtrar IDs de preparados B1. | No ofrecer huecos ni preparados sin D-1 completo. | Coincide; probado con render y mocks. |
| AV-NEON-01 | HU-04 / HU-06 / HU-08 | Ejecutar el servicio nuevo con lecturas inyectadas en una transaccion Neon `BEGIN READ ONLY`, fecha fija 08/10 y operaciones XM/escritura prohibidas; terminar con `ROLLBACK`. | Respetar origen y fuentes reales sin ampliar artificialmente los elegibles. | Gene 09..10, Demanda 09, Precio ninguno; validado en lectura. |

Comandos ejecutados:

- Backend: `bun run typecheck`, seguido de `bun test` sobre los seis archivos
  de pruebas backend indicados arriba: **169 pass, 0 fail, 585 aserciones**.
- Frontend: `bun test tests/forecast.test.tsx tests/prepared-datasets.test.tsx`:
  **61 pass, 0 fail, 223 aserciones**; `bunx tsc -b --pretty false` aprobado.
- ESLint dirigido a los cinco archivos frontend de implementacion modificados:
  aprobado, sin errores.

Resultado read-only del codigo nuevo sobre Neon:

| Serie | Ultima observacion | Candidatos | Elegibles | Razon |
| --- | --- | --- | --- | --- |
| Gene | 2026-10-03 | 2026-10-09..2026-10-15 | 2026-10-09, 2026-10-10 | AVAILABLE |
| DemaSIN | 2026-10-03 | 2026-10-09..2026-10-14 | 2026-10-09 | AVAILABLE |
| PrecBolsNaci | 2026-10-05 | 2026-10-09 | Ninguno | SOURCE_DATA_STALE |

Esta evidencia valida el servicio nuevo y los consumidores con mocks; no
afirma despliegue ni una nueva ejecucion real de forecasts. No se sincronizo
XM ni se escribio en Neon. Los tests HTTP de regresion usan servidores y
repositorios mock aislados. Los cambios quedaron sin commit ni push.

## Optimizacion de cobertura y aislamiento por metrica (2026-10-08)

Relacion con HU-04, HU-06 y HU-08: conserva la construibilidad y las fuentes XM
anteriores; mejora la consulta y permite informar indisponibilidad individual.
No cambia el runtime, features, modelos, horizontes ni los criterios B1/V5.

Antes, `readXmCoverage` descargaba todos los `EnergyDataset.content` de los
consolidados de cada metrica, incluidos historicos superpuestos.
`Promise.all` rechazaba la respuesta completa si una metrica no tenia cobertura.

Ahora la disponibilidad usa un lector separado, con una consulta SQL
parametrizada por metrica:

- Gene y Precio reciben una fila de metadata (`min(fecha_xm)`, `max(fecha_xm)` y
  comprobaciones estructurales/calendario), sin observaciones consolidadas.
- Demanda recibe pares distintos fecha/valor diario, sin documentos completos
  ni repeticion de valores identicos por historicos superpuestos. Sigue usando
  la evaluacion semantica original y `resolveDemandV5Origin`.
- No se usa `requestedTo` como sustituto de fechas observadas ni se presume
  que el ultimo consolidado contiene todo el union historico.
- PostgreSQL todavia inspecciona los consolidados almacenados para agregar y
  detectar contenido corrupto/conflictos. Esta mejora elimina la descarga y
  procesamiento de sus JSON completos en la aplicacion, no todos los scans
  historicos en DB.
- El historial diario unico de Demanda se conserva: las exclusiones semanticas
  del contrato y la comparacion preparado/consolidado requieren ese contexto.
- Los preparados compatibles siguen leyendose completos: sus validadores
  compartidos comprueban inconsistencias/duplicados del artefacto y entre
  artefactos. Recortarlos sin conservar esas comprobaciones cambiaria criterios.
- El lector original usado por sync y forecasts POST permanece sin cambios.
  No se crea esquema, cache ni metadata persistida nueva.

La agregacion usa `Promise.allSettled`. Solo se convierten en resultados
individuales los errores de dominio explicitamente reconocidos: cobertura
ausente, conflicto consolidado de Demanda, preparados inconsistentes, datos
insuficientes/semanticamente no utilizables o modelo incompatible.
Una metrica fallida tiene `hasFutureForecastWindow=false`, lista elegible vacia,
`availabilityReason` concreto y `availabilityError={code,message}` opcional.
Sus fechas observadas/origen y `dataFreshnessDays` son `null`: no se inventa
una fecha fuente. Conserva `currentDate`, horizontes y candidatos.
Las respuestas correctas conservan sus campos/valores anteriores.

DB indisponible y errores estructurales/inesperados siguen siendo fallos
globales HTTP 500; autenticacion sigue siendo 401. El frontend fue adaptado
solo para validar esta variante explicita y mostrar el error en su modulo,
sin descartar peers ni habilitar fechas del modulo fallido.

### Evidencia de eficiencia real en Neon

Ejecucion final: `2026-10-08T19:22:03.559Z` (14:22 UTC-05).
Transaccion `BEGIN READ ONLY`, `transaction_read_only=on`, final `ROLLBACK`.
No escrituras, sync, preparacion ni inferencia.

| Metrica | Antes: JSON consolidados descargados | Antes: registros consolidados transferidos | Despues: JSON completos descargados | Despues: resultado de cobertura |
| --- | ---: | ---: | ---: | --- |
| Gene | 6 | 119904 | 0 | 1 fila metadata; 0 observaciones |
| DemaSIN | 4 | 3004 | 0 | 1 fila con 1008 pares diarios distintos |
| PrecBolsNaci | 6 | 120264 | 0 | 1 fila metadata; 0 observaciones |

Las llamadas principales siguen siendo 3 consultas de cobertura y 3 de
preparados: no se afirma reduccion de llamadas, latencia, MB o costo monetario.
Los conteos anteriores se obtuvieron con agregados SQL, sin imprimir registros.
Se comprobo la paridad del SQL contra el lector anterior usando consolidados
superpuestos aislados para las tres metricas y cuatro casos de fecha invalida.

Con fecha fija `2026-10-08`, la logica optimizada sobre Neon devuelve:

- Gene: ultima observacion 03/10; elegibles 09/10 y 10/10.
- DemaSIN: ultima observacion 03/10; elegible 09/10.
- PrecBolsNaci: ultima observacion 05/10; sin elegibles, `SOURCE_DATA_STALE`.

Precio no esta recuperado. La validacion es del servicio con lectores
inyectados en la transaccion read-only; no afirma despliegue del endpoint.

Pruebas nuevas: `forecast-availability-coverage.test.ts` instrumenta una llamada
de cobertura/fila por metrica, proyeccion metadata, deduplicacion y errores;
`forecast-availability.test.ts` prueba peers disponibles con otras metricas
ausentes, error de cobertura, conflicto, error global DB y regresion 08/10.
Los tests HTTP mantienen 401/500 y los frontend validan/renderizan errores
individuales sin perder la disponibilidad de las otras series.

| ID | HU | Precondicion / pasos | Resultado obtenido |
| --- | --- | --- | --- |
| AV-OPT-01 | HU-04 / HU-06 / HU-08 | Consultar fixtures aisladas, una metrica disponible y las otras sin cobertura; repetir para las tres. | Las disponibles conservan targets; las ausentes tienen error individual; probado. |
| AV-OPT-02 | HU-04 / HU-06 / HU-08 | Simular error de cobertura/conflicto, DB global y autenticacion HTTP. | Dominio aislado por metrica; DB 500; auth 401; probado. |
| AV-OPT-03 | HU-04 / HU-06 / HU-08 | Instrumentar lectores mock; prohibir lector completo de sync durante availability; comprobar proyeccion. | Una query por metrica, sin lectura completa en la aplicacion; probado. |
| AV-OPT-NEON-01 | HU-04 / HU-06 / HU-08 | BEGIN READ ONLY; ejecutar SQL/servicio con fecha fija 08/10; contar metadata; ROLLBACK. | Conteos de la tabla anterior y elegibles 09,10 / 09 / ninguno; validado read-only. |

Validacion final ejecutada:

- `bun run typecheck` backend: aprobado.
- `bun test` sobre availability, coverage, sync, controller, Gene, V5 y B1:
  **181 pass, 0 fail, 630 aserciones**, siete archivos.
- Frontend forecast/prepared-datasets: **62 pass, 0 fail, 231 aserciones**.
- `bunx tsc -b --pretty false` frontend y ESLint dirigido a los cuatro archivos
  frontend de implementacion modificados: aprobados. Backend no tiene script
  ni configuracion de lint; se uso su typecheck existente.
- Diagnosticos del editor y `git diff --check`: sin errores.

No se hizo commit ni push. El servicio fue validado en lectura; no se afirma
una medicion de latencia ni despliegue/reinicio del backend.
