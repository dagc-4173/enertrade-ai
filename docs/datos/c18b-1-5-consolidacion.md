# C18b-1.5 - Recuperación pending y consolidación multiventana

## Alcance

Se implementaron recuperación segura de manifiestos XM abandonados y consolidación interna de solo lectura. No se consultó XM, no se insertaron ventanas nuevas, no se reentrenaron modelos, no se modificó frontend y no se creó una migración Prisma.

## Política pending y concurrencia

`updatedAt` es el lease de una adquisición `pending`. Se considera abandonada únicamente si su marca es anterior a cinco minutos respecto al intento de recuperación. Cinco minutos no representa un timeout de XM: XM está configurado con timeout de 15 segundos y la llamada externa ocurre fuera de transacción; el margen protege una adquisición activa y su confirmación de base de datos.

- Pending reciente: responde `XM_WINDOW_IN_PROGRESS`, sin consulta externa.
- Pending abandonado: `updateMany` condicional por `id`, `status=pending` y `updatedAt < cutoff` renueva el lease y permite un único reintento.
- Failed: otro `updateMany` condicional lo devuelve a `pending` para retry.
- Completed: devuelve el manifiesto y dataset existentes con `reused=true`.

El `updatedAt` renovado es un fence: la transacción que crea dataset y completa la ventana exige el mismo valor. Si pierde el lease, el dataset se revierte y no puede marcar como failed el lease de otro proceso. La constraint única del rango conserva la identidad durante toda recuperación.

## Consolidación virtual

`xm-window-consolidation.service.ts` acepta `metric`, `from` y `to`. Lee solo ventanas `completed` XM que intersectan el rango, las ordena por rango e ID y recupera sus `EnergyDataset` asociados.

Las identidades canónicas son:

| Métrica | Identidad | Cobertura exigida |
| --- | --- | --- |
| Gene | `fecha_xm + hora_xm` | 24 periodos por día |
| DemaSIN | `fecha_xm` | una fila por día |
| PrecBolsNaci | `fecha_xm + periodo` | 24 periodos por día |

Dos ventanas solapadas con el mismo registro se deduplican de forma determinista. La misma identidad con valor distinto produce `XM_CONSOLIDATION_CONFLICT`. Un día o periodo faltante produce `XM_CONSOLIDATION_INCOMPLETE`; no se imputa información.

La respuesta conserva `metric`, rango, `rowCount`, `sourceWindowIds`, `sourceDatasetIds`, `unit`, `granularity`, `coverage`, registros ordenados y `contentHash`. El hash es SHA-256 de `JSON.stringify({ metric, unit, granularity, records })`, donde los registros ya están normalizados y ordenados por fecha y periodo. No depende del orden de llegada de las ventanas.

## Pruebas

Pruebas sin XM real:

- `xm-window-ingestion.test.ts`: 12 pruebas, 39 aserciones. Incluye pending reciente, abandono, recuperación simultánea, retry failed y reuso completed.
- `xm-window-consolidation.test.ts`: 5 pruebas, 9 aserciones. Incluye dos ventanas consecutivas para las tres métricas, deduplicación de solape, conflicto y hueco.

Prueba controlada por lectura de las tres ventanas existentes de `2024-01-01` a `2024-01-03`:

| Métrica | Filas | Manifiesto fuente | Dataset fuente | Hash |
| --- | ---: | ---: | ---: | --- |
| Gene | 72 | 1 | 79 | `e7babadebc0bcfc8ec964ee9d40e08e85cb8220e27c4deaa81137363d5ab6528` |
| DemaSIN | 3 | 2 | 80 | `9674869e8a34d9ceeba723792d6c45901c84d76edf36c01af173d1b09e37d572` |
| PrecBolsNaci | 72 | 3 | 81 | `ec328baf23b2a13ed7a952bbe79d85a9e20f88187f44ff2d4b6d0469fc410113` |

Cada resultado informó tres días solicitados, tres días completos y cobertura completa. La ejecución no instancia `XmProvider` ni escribe PostgreSQL.

## Preparación y forecast

Los perfiles XM validan y preparan un `EnergyDataset` individual. `PreparedDataset` tiene `sourceDatasetId` obligatorio y unicidad `(sourceDatasetId, profileId, profileVersion)`; los forecasts reciben un único `preparedDatasetId`. Por ello el corpus virtual consolidado no puede alimentar de forma trazable la preparación actual.

La continuidad virtual ya satisface la forma de los rezagos, siempre que el rango consolidado los contenga: Gene requiere D-1 y D-7 por periodo; DemaSIN requiere D-1, D-7, D-14 y D-28; Precio requiere D-1 con 24 periodos. No se ejecutó ningún modelo.

La opción recomendada es un `EnergyDataset` consolidado inmutable acompañado de una entidad de procedencia que relacione múltiples `XmIngestionWindow`, conserve rango, métrica y hash consolidado. No se eligió persistir solo un JSON ni concatenar `source`, porque no preserva una relación estructurada ni verificable con las ventanas fuente. Esto requiere una migración Prisma nueva y autorización antes de implementarse.

## Estado

No hay migración nueva en C18b-1.5. El estado es **NO-GO** para C18b-2 si implica ingesta histórica completa destinada a preparación o forecast: primero debe aprobarse el modelo Prisma del artefacto consolidado y su trazabilidad multiventana. Es **GO** para revisar/commitear el código y evidencia C18b-1.5 una vez se acepte ese límite arquitectónico.