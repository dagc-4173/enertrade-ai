# C18b-1.6 - Artefacto consolidado trazable para preparación multiventana

## Modelo aplicado

La migración `20260919054959_add_xm_consolidated_dataset_provenance` agrega:

- `XmConsolidatedDataset`: métrica, rango solicitado, hash canónico, un `EnergyDataset` consolidado único y fecha de creación.
- `XmConsolidatedDatasetSource`: tabla puente con clave primaria `(consolidatedDatasetId, xmIngestionWindowId)`.

`XmConsolidatedDataset` tiene una FK única a `EnergyDataset` y la identidad única `(metric, requestedFrom, requestedTo, contentHash)`. La tabla puente tiene FKs restrictivas a la cabecera y a cada ventana. No se duplica el dataset fuente en la puente: se obtiene verificablemente por `XmIngestionWindow.energyDatasetId`.

## Materialización e idempotencia

El servicio interno `xm-consolidated-dataset.service.ts` llama al consolidador C18b-1.5, que ya valida continuidad, identidad temporal, solapes y hash. Construye el `content` canónico que esperan los validadores XM y persiste en una transacción:

1. relee todas las ventanas fuente como `provider=xm`, métrica solicitada y `status=completed`;
2. compara IDs de ventanas y datasets con el corpus consolidado;
3. crea el `EnergyDataset` inmutable con columnas XM compatibles;
4. crea la cabecera y los enlaces de procedencia.

No existe una API pública que acepte IDs de ventana para crear la puente. Por ello una ventana no completed no puede convertirse en fuente por el servicio. La integridad de estado se vuelve a comprobar dentro de la transacción para evitar una referencia obsoleta.

El `source` es descriptivo (`XM consolidated;metric=...;startDate=...;endDate=...;sha256=...`) y no se usa como identidad técnica. Ante la misma métrica, rango y hash, el servicio reutiliza la cabecera existente. La constraint única y el manejo de `P2002` impiden duplicados lógicos bajo concurrencia; el rollback transaccional evita datasets huérfanos.

## Hash y contenido

El hash es el SHA-256 heredado del corpus C18b-1.5: `JSON.stringify({ metric, unit, granularity, records })`, con registros normalizados y ordenados por fecha/período. El dataset materializado guarda exactamente esos registros y estas columnas obligatorias:

| Métrica | Columnas |
| --- | --- |
| Gene | `fecha_xm`, `hora_xm`, `energia_kwh` |
| DemaSIN | `fecha_xm`, `demanda_kwh` |
| PrecBolsNaci | `fecha_xm`, `periodo`, `precio_cop_kwh` |

## Pruebas

`xm-consolidated-dataset.test.ts` ejecuta cuatro pruebas sin XM real: materialización simple y reuso, hash distinto, dos fuentes, rechazo de procedencia no completed, rollback y recuperación de colisión `P2002`. La suite C18b-1.5 mantiene pruebas de dos ventanas consecutivas, continuidad, solape idéntico, conflicto y hueco.

La prueba persistida controlada usó exclusivamente las tres ventanas existentes de `2024-01-01` a `2024-01-03`:

| Métrica | Consolidado | EnergyDataset | Filas | Ventana fuente | Dataset fuente | PreparedDataset |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gene | 1 | 82 | 72 | 1 | 79 | 52 |
| DemaSIN | 2 | 83 | 3 | 2 | 80 | 53 |
| PrecBolsNaci | 3 | 84 | 72 | 3 | 81 | 54 |

La repetición devolvió los mismos consolidado/dataset con `reused=true`. Los tres EnergyDataset se validaron como `aprobado` y la preparación existente produjo PreparedDataset que apuntan a los datasets consolidados `82`, `83` y `84`.

La consulta inversa observada fue: `PreparedDataset → sourceDatasetId → XmConsolidatedDataset → XmConsolidatedDatasetSource → XmIngestionWindow(status=completed) → energyDatasetId` original. Esto demuestra trazabilidad desde la preparación hasta las fuentes XM sin depender de metadata JSON.

## Forecast readiness y límites

El artefacto permite preparar históricos multiventana, pero no ejecuta modelos. Para una fecha objetivo el corpus debe incluir, además de la fecha objetivo, Gene D-1/D-7 por período, DemaSIN D-1/D-7/D-14/D-28 y Precio D-1 con 24 períodos. Las pruebas de tres días no satisfacen esos rezagos.

No se descargó histórico adicional, no se creó endpoint público y no se modificaron frontend, modelos ni gráficas. La carrera `P2002` y el rollback están simulados en tests; una carrera concurrente contra PostgreSQL sigue siendo evidencia operativa pendiente antes de una carga masiva.