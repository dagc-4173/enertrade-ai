# HU-20 - Integracion backend <-> motor IA

## Estado

| Dimension | Estado |
| --- | --- |
| Script reproducible | Implementado |
| Ejecucion C15b PostgreSQL | Bloqueada en matching global |
| Ejecucion C15c PostgreSQL | Probada tecnicamente |
| Cleanup | Probado tecnicamente |
| HU20 completa | Implementada y probada tecnicamente |
| Validacion academica/formal | Pendiente |
| Despliegue | Pendiente |

## Alcance y entorno

El ejecutable permanente es [hu20-integration.ts](../../../backend/scripts/hu20-integration.ts). Levanta la aplicacion Express real en un puerto efimero y usa Prisma, PostgreSQL y los artefactos versionados del backend. No usa mocks como evidencia principal, no crea migraciones y no modifica contenido de datasets.

La configuracion local proporciono `DATABASE_URL`; se verifico sin exponerla que no contiene marcadores de produccion y que su clase de host es Neon. `GET /health` respondio `200`, `status=ok` y `dependencies.database=ok` antes de las inferencias.

Datasets leidos sin modificacion:

| PreparedDataset | Perfil | Ruleset | Uso |
| ---: | --- | --- | --- |
| 17 | `xm_gene_preparacion_base@1.0.0` | `xm_gene_base@1.0.0` | Supply |
| 33 | `xm_demandasin_preparacion_base@1.0.0` | `xm_demandasin_base@1.0.0` | Demand |
| 49 | `xm_preciobolsnaci_preparacion_base@1.0.0` | `xm_preciobolsnaci_base@1.0.0` | Price |
| 18 | `xm_demandasin_preparacion_base@1.0.0` | `xm_demandasin_base@1.0.0` | Patterns |

## Ejecucion consolidada HU20

Ejecucion real bloqueada: `hu20-integration-8a047677-4483-4858-b8a9-63cc6817a10a`. Los tiempos son observados mediante `performance.now()`; no representan SLA.

| ID | Endpoint | Entrada / precondicion | Esperado | Obtenido | HTTP | Tiempo observado (ms) | Request ID | Estado |
| --- | --- | --- | --- | --- | ---: | ---: | --- | --- |
| INT20-01 | `/health` | Aplicacion y DB reales | `ok`, DB `ok` | Contrato cumplido | 200 | 96.943 | `5de12059-9d94-4ef6-894b-0d1c96ccfcdb` | Probado |
| INT20-01 | `/capabilities/versions` | Sin parametros | 5 capacidades | Exactamente 5 | 200 | 9.573 | `e2c07cd4-461b-4d1f-a936-5084cc1e62b2` | Probado |
| INT20-02 | `/forecasts/supply` | 17, `2024-04-08` | disponible, 24, Ridge 1.0.0 | Contrato y traza `succeeded` comprobados | 200 | 249.311 | `c80a72ab-69be-4c4a-a1d3-f20182547c85` | Probado |
| INT20-03 | `/forecasts/demand` | 33, `2024-09-29` | disponible, Ridge 1.0.0 | Contrato y traza `succeeded` comprobados | 200 | 85.496 | `c28abc0f-4ea2-4e02-b701-8ef4f50b6e15` | Probado |
| INT20-04 | `/forecasts/price` | 49, `2024-09-29` | 24, regla B1 1.0.0 | Ejecucion funcional y traza transversal comprobadas | 200 | 414.600 | `556adbc9-fcab-442f-8928-d4adf443d6a5` | Probado |
| INT20-05 | `/matches/suggest` | Oferta/demanda temporales compatibles | al menos una sugerencia | Resultado y `MatchingExecution` comprobados | 200 | 403.350 | `e50afa6b-2968-491a-9c50-fe8a907b2922` | Probado |
| INT20-06 | `/patterns/analyze` | 18, sesion temporal | `completed` o `partial` | Analisis y metodo persistidos comprobados | 200 | 318.085 | `3d8aa4f2-11d8-4c5c-a25f-5874e279f86d` | Probado |
| INT20-07 | `/matches/suggest` | Se elimino la oferta temporal | `no_matches`, traza `empty` | HTTP 200, pero el resultado global no fue `no_matches` | 200 | 400.207 | `0aedbf70-769e-4f14-9758-150ecc9f4654` | Bloqueado |
| INT20-08 | `/forecasts/supply` | `preparedDatasetId` no numerico | 400 seguro | No ejecutado tras bloqueo INT20-07 | - | - | - | Pendiente |
| INT20-09 | `AiQueryTrace` | Request ID INT20-08 | `failed`, codigo seguro | No ejecutado tras bloqueo INT20-07 | - | - | - | Pendiente |
| INT20-10 | Todos | Duraciones HTTP y trazas | Registro sin SLA | Parcial: INT20-01..07 registrados | - | - | - | Implementado parcialmente |
| INT20-11 | Todos | Versiones esperadas | Identidades versionadas | Supply, Demand, Price, Matching y Patterns comprobados antes del bloqueo | - | - | - | Implementado parcialmente |
| INT20-12 | Cleanup | Recursos temporales explicitos | Conteos restaurados | Conteos iniciales y finales identicos | - | - | - | Probado |

Las versiones verificadas antes del bloqueo fueron: `xm-gene-ridge@1.0.0` (ML), `xm-demandasin-ridge@1.0.0` (ML), `xm-preciobolsnaci-b1@1.0.0` (regla determinista), `matching-v1` (metodo determinista) y `energy-pattern-descriptive@1.0.0` (metodo estadistico determinista).

## Ejecucion C15c

La ejecucion `hu20-integration-25c59ca6-4741-4cee-bc9c-29f10d48de0e` reemplazo el ejecutor secuencial por casos aislados `PASS`, `FAIL` o `BLOCKED`. Un fallo de un caso ya no evita INT20-08, INT20-09, INT20-10, INT20-11 ni el cleanup final. No se modifico ningun servicio funcional, esquema, migracion, manifest, dataset o publicacion ajena.

### Auditoria de alternativas empty

| Alternativa | Resultado de auditoria | Decision |
| --- | --- | --- |
| Matching `no_matches` | El endpoint considera todas las publicaciones activas globales. No es aislable por fecha o usuario sin modificar registros ajenos. | No seleccionada; bloqueo historico conservado. |
| Forecast unavailable | Supply acepta la solicitud valida `{preparedDatasetId:17,targetDate:"2024-03-31"}`. La fecha supera el limite de entrenamiento, pero no tiene la historia D-1/D-7 necesaria; devuelve `422`, `status=unavailable`, `FORECAST_DATA_INSUFFICIENT`. HU17 mapea `unavailable` a `executionStatus=empty`. | Seleccionada. |
| Patterns `no_results` | El metodo solo retorna `no_results` cuando el preparado no tiene observaciones. Los preparados reales auditados para HU20 tienen contenido y crear uno vacio seria artificial. | No seleccionada. |
| `GET /patterns` vacio | El servicio lista analisis persistidos y puede retornar `[]` con filtros validos; es una consulta de historial, no una ejecucion analitica. | No seleccionada, porque forecast unavailable tiene semantica de inferencia mas directa. |

### Matriz C15c

| ID | Resultado | Endpoint | HTTP | Tiempo HTTP (ms) | Tiempo trace (ms) | Request ID | Estado |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| INT20-01 | Health y cinco capacidades | `/capabilities/versions` | 200 | 9.888 | 3 | `ababb372-2c0a-439a-894b-5128065835ca` | PASS |
| INT20-02 | Supply disponible, 24 predicciones | `/forecasts/supply` | 200 | 245.352 | 243 | `552b9fe2-7122-47e9-b8a3-4b61578df8fc` | PASS |
| INT20-03 | Demand disponible | `/forecasts/demand` | 200 | 83.748 | 83 | `0d924600-34fb-4415-a8cc-08e5a59b9a6d` | PASS |
| INT20-04 | Price, regla B1 y ejecucion funcional | `/forecasts/price` | 200 | 356.079 | 354 | `b3e9721b-7308-4fa7-aacd-bc73bb8ff5da` | PASS |
| INT20-05 | Matching temporal compatible | `/matches/suggest` | 200 | 415.723 | 414 | `1e3c7c37-7480-467d-b26e-6e3204881b0c` | PASS |
| INT20-06 | Patterns persistido | `/patterns/analyze` | 200 | 347.020 | 346 | `d4ce3670-0339-460f-8932-6fce5e576235` | PASS |
| INT20-07 | Supply valido sin historia suficiente; `unavailable -> empty` | `/forecasts/supply` | 422 | 176.864 | 175 | `008924e4-e75a-474a-9a6a-a7ff99dc0b50` | PASS |
| INT20-08 | Envelope invalido seguro | `/forecasts/supply` | 400 | 2.263 | 0 | `3d8ec40a-2b48-43db-bafc-3540a3a4467a` | PASS |
| INT20-09 | Mismo request ID: trace `failed`, `INVALID_FORECAST_REQUEST` | `AiQueryTrace` | 400 | 2.263 | 0 | `3d8ec40a-2b48-43db-bafc-3540a3a4467a` | PASS |
| INT20-10 | Nueve tiempos HTTP observados, sin SLA | Runner | - | - | - | - | PASS |
| INT20-11 | Cinco identidades/versiones comprobadas | Runner | - | - | - | - | PASS |
| INT20-12 | Conteos restaurados | PostgreSQL | - | - | - | - | PASS |

El subcaso informativo `INT20-07-matching` permanece `BLOCKED`: no se ejecuto para producir un falso `no_matches`. No es un caso requerido de la matriz final porque INT20-07 se cubrio con una solicitud real de forecast sin resultado disponible.

Conteos de C15c antes/despues: `AiQueryTrace 0/0`, `PriceForecastExecution 11/11`, `MatchingExecution 0/0`, `PatternAnalysis 0/0`, `User 9/9`, `AuthSession 3/3`, `EnergyOffer 3/3` y `EnergyDemand 2/2`.

## Bloqueo INT20-07

`POST /matches/suggest` evalua todas las publicaciones activas globales, no solo las de la fecha aislada ni las del usuario temporal. Al eliminar la oferta temporal, la demanda temporal no tuvo oferta compatible, pero publicaciones preexistentes conservaron sugerencias globales. Por tanto, la respuesta no fue `no_matches` y `AiQueryTrace.executionStatus` no podia ser `empty`.

Forzar ese estado requeriria modificar o retirar publicaciones preexistentes, lo cual queda fuera del alcance y contradice la restriccion de no alterar registros ajenos. No se sustituye este resultado por un mock ni se declara aprobado.

## Cleanup y conteos

El script conserva listas explicitas de IDs de trazas, ejecuciones de precio/matching/patrones, publicaciones, sesiones y usuarios. La limpieza elimina solo los IDs capturados en `finally` y respetando el orden de FKs.

| Tabla | Inicial | Final |
| --- | ---: | ---: |
| AiQueryTrace | 0 | 0 |
| PriceForecastExecution | 11 | 11 |
| MatchingExecution | 0 | 0 |
| PatternAnalysis | 0 | 0 |
| User | 9 | 9 |
| AuthSession | 3 | 3 |
| EnergyOffer | 3 | 3 |
| EnergyDemand | 2 | 2 |

No se retuvieron tokens, contrasenas, cookies, URLs de base de datos ni datos temporales. Los IDs de recursos temporales se mantuvieron solo durante la ejecucion y se eliminaron antes del conteo final.

## Error 500 controlado

No se corrompieron manifests, no se degradaron dependencias y no se modifico `DATABASE_URL`. Los envelopes 500 controlados permanecen cubiertos por las pruebas automatizadas de HU14, HU15 y HU17. La integracion real HU20 alcanzo respuestas 200 y cleanup, pero no llego a ejecutar 400/error-event por el bloqueo anterior.

## Evidencia previa complementaria

La evidencia de HU04, HU09, HU11, HU12, HU17, HU18 y HU19 es complementaria. No sustituye esta ejecucion consolidada ni convierte INT20-07..09 en casos aprobados.

## Siguiente decision requerida

Para completar HU20 debe autorizarse una alternativa que permita una respuesta vacia global sin alterar registros ajenos: aislar el repositorio de matching en un entorno de integracion dedicado, introducir un filtro de alcance en el contrato de matching, o aceptar un caso vacio en otra capacidad como `GET /patterns` con resultado vacio. La primera dos opciones son decisiones de producto/arquitectura y no se aplicaron.