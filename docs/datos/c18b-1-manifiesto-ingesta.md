# C18b-1 - Manifiesto de ingesta XM e idempotencia controlada

## Alcance

Se implemento la persistencia minima para ventanas XM idempotentes y se probaron tres ventanas reales de tres dias. No se ejecuto ingesta masiva, reentrenamiento, cambio de frontend ni modificacion de modelos.

## Modelo y flujo

La migracion `20260919051949_add_xm_ingestion_window_manifest` crea `XmIngestionWindow` con proveedor, metrica, rango solicitado y recibido, conteo, hash, estado, error y relacion unica opcional a `EnergyDataset`.

La clave unica es `(provider, metric, requestedFrom, requestedTo)`. El rango solicitado identifica la ventana logica; el hash SHA-256 no se usa como identidad porque no debe permitir una segunda persistencia de la misma ventana si una respuesta posterior cambia.

- `pending`: reserva la identidad antes de consultar XM. En C18b-1.5 se recupera solo si `updatedAt` es anterior a cinco minutos; la recuperacion condicional renueva `updatedAt` como lease/fence.
- `completed`: la respuesta completa se valido y se persistieron manifiesto y dataset en una transaccion.
- `failed`: XM, el contrato o la cobertura fallaron; no se crea dataset parcial y el rango puede reintentarse.

Una solicitud `completed` devuelve el mismo manifiesto/dataset con `reused=true` y no llama XM. Una solicitud `pending` reciente devuelve conflicto controlado. Un pending abandonado usa `updateMany` condicionado por `id`, estado y `updatedAt`; solo un proceso obtiene el lease y el mismo fence protege la finalizacion transaccional.

El hash es SHA-256 de JSON determinista con `metric`, `unit`, `granularity` y registros normalizados, ordenados por fecha y periodo. La validacion exige unidad, granularidad, valores finitos, fechas dentro de la ventana, identidad unica y cobertura completa: 24 periodos diarios para Gene/PrecBolsNaci y una observacion diaria para DemaSIN.

## Pruebas automatizadas

`bun test src/tests/xm-window-ingestion.test.ts` ejecuto 10 pruebas, 0 fallidas y 30 aserciones. Cubre ventana valida, limite de 30 dias, reuso completed, failed/retry, hash estable, respuesta incompleta o duplicada, conflicto P2002, rollback simulado y pending concurrente.

La regresion posterior ejecuto `bun test`: 679 pruebas en 27 archivos, sin errores. `bun run typecheck` fue correcto. `prisma migrate status` confirmo 10 migraciones aplicadas.

## Prueba real acotada

Se consultaron y persistieron solo estas ventanas mediante el servicio C18b-1:

| Metrica | Rango | Manifiesto | EnergyDataset | Filas | Hash SHA-256 |
| --- | --- | ---: | ---: | ---: | --- |
| Gene | 2024-01-01 a 2024-01-03 | 1 | 79 | 72 | `e7babadebc0bcfc8ec964ee9d40e08e85cb8220e27c4deaa81137363d5ab6528` |
| DemaSIN | 2024-01-01 a 2024-01-03 | 2 | 80 | 3 | `9674869e8a34d9ceeba723792d6c45901c84d76edf36c01af173d1b09e37d572` |
| PrecBolsNaci | 2024-01-01 a 2024-01-03 | 3 | 81 | 72 | `ec328baf23b2a13ed7a952bbe79d85a9e20f88187f44ff2d4b6d0469fc410113` |

Antes habia 49 `EnergyDataset` y 0 manifiestos. Despues de la primera ejecucion habia 52 y 3, respectivamente. La repeticion exacta devolvio los mismos IDs con `reused=true`; los conteos quedaron en 52 y 3, y el provider mantuvo exactamente tres llamadas totales. La repeticion no consulto XM.

## Limites pendientes

- No se descargaron las aproximadamente 99 ventanas estimadas de la carga completa.
- La recuperacion de pending tiene lease de cinco minutos; su duracion debe revisarse antes de ejecutar procesos con latencias externas diferentes a XM.
- La preparacion y los forecasts actuales leen un solo `PreparedDataset`; C18b-1.5 consolida en memoria, pero la persistencia trazable de un artefacto multiventana requiere una decision Prisma posterior.
- No se introduce endpoint HTTP publico para iniciar ingestas; C18b-1 expone solo un servicio interno probado.