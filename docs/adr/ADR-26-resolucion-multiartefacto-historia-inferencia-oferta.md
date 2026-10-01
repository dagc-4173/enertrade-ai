# ADR-26 — Resolución multi-artefacto de historia para inferencia de oferta

## Contexto

HU-04 (`POST /forecasts/supply`, `xm-gene-ridge@1.0.0`) infiere sobre las
observaciones D-1 y D-7 de generación XM Gene. Los datos llegan diariamente en
lotes separados: HU-01 registra un `EnergyDataset` por lote, HU-02 lo valida y
HU-03 genera un `PreparedDataset` (`xm_gene_preparacion_base@1.0.0`,
`xm_gene_base@1.0.0`) por cada `EnergyDataset`. Como resultado, el histórico
real queda repartido entre múltiples `PreparedDataset` inmutables.

El contrato anterior exigía `{ preparedDatasetId, targetDate }` y leía
exactamente un `PreparedDataset` (`prisma.preparedDataset.findUnique`). Si
D-1 y D-7 no coexistían dentro de ese único artefacto, la solicitud fallaba con
`422 FORECAST_DATA_INSUFFICIENT` aunque ambos días existieran, repartidos en
otros `PreparedDataset` compatibles. Esta limitación ya estaba documentada como
deuda técnica en ADR-09 ("Historia limitada a un preparado: fronteras entre
bloques pueden ser insuficientes") y es consistente con la advertencia de
ADR-23 sobre que "los forecasts actuales leen un solo PreparedDataset".

## Alternativas consideradas

**A. Mantener un único `PreparedDataset` acumulativo.** Requiere una capa de
orquestación nueva (consolidar → validar → preparar periódicamente). Existe un
cimiento parcial reutilizable (`XmConsolidatedDataset`, ADR-23), pero hoy solo
alimenta `GET /series` (gráficas), no HU-04. Cada nueva consolidación crea un
`PreparedDataset` distinto, por lo que el identificador que el cliente debería
elegir seguiría cambiando; no elimina el problema, lo traslada.

**B. Fusionar físicamente `PreparedDataset` existentes.** Exigiría que
`forecast.service.ts` cree o actualice registros, violando la frontera de
solo-lectura ya probada en el propio archivo
(`'inference dependency boundary excludes XM, preparation and training'`, que
falla si el código contiene `.create(`, `.update(` o `.delete(`). Duplica
contenido ya persistido y complica la trazabilidad de HU-03.

**C. Consultar múltiples `PreparedDataset` compatibles en tiempo de
inferencia (solo lectura).** No requiere cambios de esquema, ni de HU-01/02/03,
ni infracción de la frontera de solo-lectura. Es la alternativa adoptada.

## Decisión

`forecast.service.ts` sustituye la lectura por id (`findUnique`) por una
lectura de solo lectura de todos los `PreparedDataset` compatibles con
`profileId=xm_gene_preparacion_base`, `profileVersion=1.0.0`,
`sourceRulesetId=xm_gene_base`, `sourceRulesetVersion=1.0.0`
(`prisma.preparedDataset.findMany`, seleccionando únicamente las columnas
necesarias). El contrato HTTP se simplifica a:

```json
POST /forecasts/supply
{ "targetDate": "YYYY-MM-DD" }
```

`preparedDatasetId` deja de aceptarse; un body con esa propiedad se rechaza con
`400 INVALID_FORECAST_REQUEST` (contrato estricto: objeto con exactamente la
propiedad `targetDate`).

### Fusión y resolución de duplicados

El servicio construye en memoria un mapa global `fecha_xm|hora_xm →
energia_kwh` recorriendo todos los `PreparedDataset` compatibles:

- Un registro `fecha_xm+hora_xm` duplicado **dentro del mismo artefacto**
  siempre es inconsistente (`409 PREPARED_DATASET_INCONSISTENT`), igual que
  antes de este cambio.
- La misma clave en **artefactos distintos** con el mismo `energia_kwh` se
  acepta sin duplicarse; se conserva la trazabilidad de todos los artefactos
  que aportaron esa observación.
- La misma clave en artefactos distintos con `energia_kwh` diferente aborta de
  forma determinista con `409 PREPARED_DATASET_INCONSISTENT`; nunca se aplica
  "el último gana".
- Un `PreparedDataset` cuyo `profileId`/`profileVersion`/`sourceRulesetId`/
  `sourceRulesetVersion` no coincide exactamente con el artefacto congelado
  (`xm-gene-ridge@1.0.0`) se ignora por completo, incluso si su contenido está
  corrupto.
- Solo se leen las claves calendario `D-1` y `D-7` calculadas a partir de
  `targetDate`; observaciones del día objetivo o posteriores nunca participan,
  estén donde estén.
- Si tras consultar todos los artefactos compatibles falta cualquier periodo de
  D-1 o D-7 — incluyendo el caso de no existir ningún artefacto compatible — la
  respuesta es `422 FORECAST_DATA_INSUFFICIENT`, sin predicciones parciales.

### Trazabilidad

La respuesta exitosa reemplaza `preparedDatasetId`/`sourceDatasetId` por:

```json
"sourceArtifacts": [
  { "preparedDatasetId": 21, "sourceDatasetId": 40 },
  { "preparedDatasetId": 22, "sourceDatasetId": 41 }
]
```

incluyendo únicamente los artefactos cuyas observaciones fueron efectivamente
usadas por alguna de las 24 predicciones.

### Modelo

`xm-gene-ridge@1.0.0` no se modifica ni se reentrena. Las cinco features
permanecen congeladas (D-1 mismo periodo, D-7 mismo periodo, D-1 periodo 24,
`sin`/`cos(2π(h-1)/24)`), igual que las 24 predicciones ordenadas `hora_xm`
1..24.

## Consecuencias

- Cambio de contrato incompatible hacia atrás en `POST /forecasts/supply`
  únicamente; `/forecasts/demand` (HU-06) y `/forecasts/price` (HU-08)
  conservan `{ preparedDatasetId, targetDate }` sin cambios.
- Frontend: `ForecastPanel` deja de exigir seleccionar un `PreparedDataset`
  para Oferta energética; solo pide la fecha objetivo. Demanda y Precio
  conservan el selector `PreparedDatasetSelect`.
- No se modificó `schema.prisma`, no hay migraciones, no se tocó HU-01, HU-02
  ni HU-03.
- Un `PreparedDataset` compatible con contenido corrupto (estructura o valores
  inválidos) sigue bloqueando toda inferencia con `409
  PREPARED_DATASET_INCONSISTENT`, aunque su contenido no fuera necesario para
  el pronóstico solicitado; es una extensión deliberada del comportamiento
  "fail-closed" que ya existía para el artefacto único.

## Relación con ADR-09 y ADR-23

Esta decisión resuelve exactamente la deuda técnica anotada en ADR-09
("historia limitada a un preparado") mediante la alternativa C, sin adoptar la
ruta de consolidación física descrita en ADR-23 (que sigue siendo válida y
disponible para `GET /series`, pero no se conecta a HU-04 en este cambio).

## Separación entre capacidad técnica y validez estadística

Este cambio únicamente amplía la **capacidad técnica** de encontrar D-1/D-7
repartidos en varios `PreparedDataset`. No constituye, ni debe interpretarse
como, una validación de que `xm-gene-ridge@1.0.0` — entrenado y evaluado sobre
el holdout externo documentado en ADR-09 (hasta 2024-04-29) — sea
estadísticamente válido para fechas de 2026 o posteriores. La ausencia de
`FORECAST_DATE_NOT_SUPPORTED` para una fecha futura indica solo que es
posterior al cierre de entrenamiento, no que el modelo generalice a ese
horizonte. `lifecycle.academicValidation` permanece `pending`.

## Deuda pendiente

- Un artefacto compatible corrupto bloquea toda inferencia hasta corregirse o
  descartarse (ver "Consecuencias").
- El script de integración `backend/scripts/hu20-integration.ts` todavía
  invoca `/forecasts/supply` con el contrato anterior (`preparedDatasetId`) y
  debe actualizarse antes de su próxima ejecución real contra un entorno vivo.
- No se evaluó el impacto de homologar este mismo patrón a HU-06
  (`/forecasts/demand`); queda fuera de alcance de este ADR.
