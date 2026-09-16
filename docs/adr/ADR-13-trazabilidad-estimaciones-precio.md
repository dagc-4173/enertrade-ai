# ADR-13 — Trazabilidad de estimaciones de precio

## Estado y contexto

Decisión implementada en backend, versionada en
`1cc32465732c6f3e7a5fe7bf6c83299b9c27bc72` y probada técnicamente.
Validación académica/formal pendiente.

HU-09 exige conservar entradas, condiciones utilizadas, fecha, versión del motor,
respuesta y estado para trazabilidad técnica y revisión posterior. HU-09 depende
funcionalmente de las estimaciones de HU-08. HU-08 calcula con la regla
determinista `xm-preciobolsnaci-b1@1.0.0`, no con un modelo ML. EnergyDataset y
PreparedDataset representan datos y artefactos preparados, no intentos HTTP.
HU-17 contempla una trazabilidad más general que no se implementa aquí.

## Alternativas y decisión

- **PriceForecastExecution específica, adoptada:** alcance mínimo para HU-09 y
  aislamiento de los pronósticos HU-04/HU-06.
- ForecastExecution genérica: reutilización futura posible, pero introduce una
  abstracción y estados compartidos que este incremento no necesita.
- EnergyDataset/transacciones_simuladas: mezcla entradas con ejecuciones; el
  enum no demuestra compatibilidad con auditoría.
- Logs/archivos: no ofrecen las relaciones e integridad de la entidad adoptada.

Una fila por intento POST /forecasts/price que alcance el middleware de
trazabilidad y cuya creación pueda persistirse. Request, input y result se
almacenan como JSON; no existe tabla hija por periodo ni reconstrucción de
ejecuciones anteriores. Dos solicitudes iguales producen ejecuciones distintas.

## Flujo y contrato

El middleware de precio crea `pending` antes de Content-Type y del parser. El
servicio B1 conserva su cálculo y entrega internamente los valores D-1 realmente
usados, con sourceRecordIndex, sin consultar XM ni preparar datos nuevamente.
Una escritura final actualiza conjuntamente el resultado, entradas, HTTP,
condiciones y completedAt: `pending → succeeded` o `pending → failed`.

La FK nullable preparedDatasetId solo se asigna cuando el preparado existe.
El ID solicitado permanece en requestPayload aunque sea inexistente. La relación
usa ON DELETE RESTRICT y ON UPDATE CASCADE. sourceDatasetId se conserva en
inputSnapshot, sin segunda FK. Hay índices por createdAt, status, targetDate y
preparedDatasetId.

Request usa una lista permitida y valores limitados; no se guardan cabeceras,
cookies, credenciales, stack traces ni cuerpos JSON malformados. Los errores
persistidos usan códigos seguros. Los errores de parser también pasan por la
trazabilidad específica de precio. No se modifica el flujo de supply/demand.

HTTP añade `trace` con executionId y persistence (`persisted` o `failed`). En un
éxito persistido añade conditionsCompleteness=`partial`. En errores no se añade
completitud. No se exponen los JSON internos dentro de trace. resultPayload
conserva la respuesta técnica sin trace. referenceDate está en inputSnapshot;
no es un campo del contrato HTTP técnico actual ni de resultPayload.

## Parcialidad

B1 entrega 24 periodos técnicamente completos usando
`previous_day_same_period_price`. Se registra `partial` respecto al alcance
amplio de HU-08 porque omite exactamente:

- commercial_supply;
- commercial_demand;
- generation_forecast;
- demand_forecast.

partialReasons conserva esa lista del artefacto. `complete` queda reservado a
un futuro motor con todos los factores del alcance amplio. La parcialidad no
permite periodos requeridos ausentes: D-1 incompleto sigue produciendo
FORECAST_DATA_INSUFFICIENT, sin resultado de precio.

## Fallos y atomicidad

No existe transacción larga que englobe creación, inferencia y cierre: un
rollback eliminaría evidencia del intento. Las escrituras individuales son
atómicas. Si falla start, executionId es null; la inferencia continúa. Si falla
complete, se devuelve el resultado técnico con HTTP 200 y persistence=`failed`,
conservando el UUID si existe. Si fallan inferencia y trazabilidad se conserva
el HTTP/código original, sin reemplazarlo por un error de almacenamiento.

Una caída del proceso o fallo al finalizar puede dejar pending. No hay worker
de reconciliación, reintento automático ni garantía de almacenamiento durante
una indisponibilidad de PostgreSQL. Estos fallos se prueban mediante sustitución
de dependencias; no se provocó una caída real de PostgreSQL.

## Consecuencias y límites

Los JSON permiten conservar snapshots de las entradas y de la respuesta para
revisión posterior, dentro de una entidad específica en lugar de una abstracción
genérica. La trazabilidad aumenta escrituras y volumen almacenado; no hay política de
retención implementada. La FK restringe borrar preparados referenciados. No hay
endpoint de historial ni interfaz visual HU-09; no se adelanta HU-17.
La regla sigue siendo un precio de referencia, sin negociación ni liquidación
financiera. No se atribuye autoría a la migración o trazas históricas.

La migración `20260916000000_add_price_forecast_execution_trace` ya estaba
aplicada antes de esta validación; no fue reaplicada.
La [evidencia HU-09](../evidencias/hu-09-trazabilidad-precio/README.md) distingue
las pruebas sustituidas, las trazas anteriores y tres ejecuciones reales nuevas.
