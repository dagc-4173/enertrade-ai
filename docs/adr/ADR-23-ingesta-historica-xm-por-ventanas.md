# ADR-23 - Ingesta historica XM por ventanas inmutables y manifiesto de cobertura

**Estado:** Aceptado; C18b-1, C18b-1.5 y C18b-1.6 implementados.

## Contexto

XM/SINERGOX limita Gene, DemaSIN y PrecBolsNaci a consultas de hasta 30 dias inclusivos. La cobertura actual de PostgreSQL esta fragmentada y la ruta `POST /external-data/import` siempre crea un `EnergyDataset`: repetir una consulta puede duplicar informacion logica.

Se requiere adquirir historico desde `2024-01-01` hasta la disponibilidad que XM confirme para cada metrica, sin cambiar los contratos temporales existentes:

- Gene: `(fecha_xm, hora_xm)`, kWh, 24 periodos diarios.
- DemaSIN: `fecha_xm`, kWh, una observacion diaria.
- PrecBolsNaci: `(fecha_xm, periodo)`, COP/kWh, 24 periodos diarios.

ADR-05 y ADR-06 definen inmutabilidad y concurrencia de validacion/preparacion; no definen identidad, reintento o cobertura de importaciones externas. ADR-07, ADR-08, ADR-10 y ADR-12 conservan las identidades anteriores y no certifican continuidad historica.

## Alternativas

### A. Una ventana como EnergyDataset independiente, sin manifiesto

Conserva el contenido recibido y no requiere migracion. Se descarta: el esquema no tiene unicidad por proveedor/metrica/rango/contenido ni estado de intento. Una consulta repetida puede crear duplicados y no hay reanudacion verificable.

### B. Un EnergyDataset creciente por metrica

Facilita una preparacion unica de largo alcance, pero exige reescribir `content` y su resultado de validacion. Se descarta: contradice la inmutabilidad de `EnergyDataset` y cambia la procedencia de un dataset ya validado.

### C. Manifiesto de cobertura mas EnergyDataset inmutables por ventana

Cada respuesta aceptada conserva su ventana como `EnergyDataset` independiente. Un manifiesto separado conserva el estado y la identidad logica de la adquisicion. Es la alternativa elegida, condicionada a una nueva tabla Prisma antes de la ingesta completa.

La ventana es inmutable; un reintento con los mismos datos recupera su manifiesto confirmado y no crea otro dataset. La preparacion sigue siendo por `sourceDatasetId`, perfil y version, como define ADR-06.

### D. Deduplicacion solo en aplicacion usando source textual

No exige migracion, pero no tiene garantia unica frente a concurrencia y `source` no es un identificador estructurado ni contiene hash. Se descarta para una ingesta reanudable.

## Decision

Para C18b se persisten ventanas XM inmutables en `EnergyDataset` y un manifiesto de cobertura por ventana. C18b-1 crea la tabla Prisma y prueba el mecanismo con tres ventanas de tres dias; no descarga el historico completo.

El manifiesto tiene una clave unica por identidad solicitada:

`provider + metric + requestedFrom + requestedTo`

El hash no sustituye esa identidad: la misma ventana no puede crear dos datasets aunque XM devuelva contenido distinto en intentos posteriores. `contentHash` conserva la respuesta normalizada persistida para auditoria y una futura politica de reproceso explicita.

Y debe registrar como minimo:

```text
provider, metric, source, requestedFrom, requestedTo,
receivedFrom, receivedTo, rowCount, normalizedContentSha256,
status, fetchedAt, errorCode, energyDatasetId?
```

`status` distingue `pending`, `completed` y `failed`. `pending` reserva la identidad antes de consultar XM y evita dos adquisiciones concurrentes. Un fallo no crea un `EnergyDataset` ni se interpreta como cobertura; un `failed` puede reintentarse.

En C18b-1.5, `updatedAt` es el lease de trabajo. Un `pending` es abandonado solo cuando su `updatedAt` es anterior a cinco minutos respecto al reloj del proceso que intenta recuperarlo. El valor no es un timeout de XM: XM tiene timeout de 15 segundos y no se sostiene una transaccion durante la red; cinco minutos deja un margen operacional amplio para una consulta activa y para la escritura posterior. Un pending mas reciente responde conflicto/retry later.

La recuperacion ejecuta un `updateMany` condicional por `id`, `status=pending` y `updatedAt < cutoff`. El `updatedAt` renovado funciona como fence. La finalizacion y el marcado de fallo vuelven a exigir el mismo `updatedAt`; quien pierde el lease no puede completar ni marcar como fallido el trabajo de otro proceso. Por tanto, dos procesos no recuperan ni persisten la misma ventana simultaneamente.

La implementacion crea el manifiesto `pending`, consulta XM fuera de transaccion y, para una respuesta completa, crea el `EnergyDataset` y completa el manifiesto dentro de una transaccion. La restriccion unica del manifiesto es la garantia de idempotencia; una consulta previa solo es optimizacion. La FK unica opcional `energyDatasetId` expresa una relacion uno a cero/uno: una ventana completada tiene un solo dataset inmutable.

## Semantica de cobertura

Por cada metrica:

- `requestedUntil`: limite superior que C18b pide a XM en una ejecucion; no significa que XM lo haya entregado.
- `availableUntil`: ultima fecha recibida y completa observada en XM durante un sondeo o ventana confirmada.
- `persistedUntil`: ultima fecha completa representada por manifiestos `succeeded` y `EnergyDataset` asociados.
- `preparedUntil`: ultima fecha completa del PreparedDataset concreto; no se deriva solo de `preparedAt`.

No se infiere `availableUntil` por la fecha del sistema. Una fecha horaria requiere exactamente los periodos 1..24; una fecha DemaSIN requiere una observacion diaria. Una respuesta parcial reduce el limite a la ultima fecha completa recibida.

## Ventanas y reanudacion

Para cada metrica, desde `2024-01-01` hasta el `availableUntil` observado:

1. La primera ventana es `[2024-01-01, min(2024-01-30, availableUntil)]`.
2. Cada rango es inclusivo y contiene como maximo 30 dias.
3. La siguiente ventana comienza en `previous.requestedTo + 1 dia`; no hay solapamiento accidental.
4. La ultima termina exactamente en `availableUntil`.
5. Ante error recuperable, se reintenta la misma ventana con limite y backoff configurados; no se avanza el cursor.
6. Al reiniciar, se toma la primera ventana sin manifiesto `succeeded`; para actualizacion incremental se empieza en `persistedUntil + 1 dia` y se vuelve a sondear `availableUntil`.

Cada bloque debe validar contrato XM, unidad, identidad, valores finitos, rango recibido, duplicados y completitud por dia antes de persistirse. No se rellenan huecos ni se imputan valores.

## Consecuencias

- La migracion `20260919051949_add_xm_ingestion_window_manifest` agrega el enum, manifiesto, indice de estado, clave unica de ventana y FK restrictiva.
- Aumenta filas de `EnergyDataset` y JSONB; los PreparedDataset tambien duplican contenido preparado por cada ventana.
- Los forecasts actuales leen un solo PreparedDataset. Una serie multianual particionada no permite por si sola resolver rezagos entre ventanas; C18b debe definir un artefacto consolidado inmutable o una estrategia de seleccion para C19 antes de inferencia multibloque.
- C18b-1.5 agrega consolidacion virtual de solo lectura: consulta solo manifiestos `completed`, deduplica por identidad temporal, exige cobertura completa y devuelve hash, fuentes y corpus ordenado. No persiste un nuevo EnergyDataset.
- C18b-1.6 materializa el corpus virtual en un `EnergyDataset` inmutable y lo registra en `XmConsolidatedDataset`. La tabla puente `XmConsolidatedDatasetSource` conserva cada ventana fuente; desde esta se obtiene su `EnergyDataset` original por la FK ya existente de `XmIngestionWindow`, sin duplicar esa referencia.
- Mantiene la procedencia de cada respuesta, permite reintento y evita tratar una fecha solicitada como disponible.
- No modifica modelos, reglas, frontend ni la frontera meteorologica de ADR-15.

## Condiciones para implementacion

La capa de manifiesto, hash canonico, transaccion, recuperacion de pendientes, consolidacion virtual y artefacto consolidado trazable ya estan implementadas. `XmConsolidatedDataset` usa la identidad unica `(metric, requestedFrom, requestedTo, contentHash)` y una FK unica a `EnergyDataset`; el servicio valida dentro de transaccion que todas las fuentes siguen `completed` y corresponden a los datasets usados por el corpus antes de crear los enlaces. Los preparadores existentes pueden consumir el dataset consolidado como `sourceDatasetId` unico. No se debe iniciar descarga masiva fuera de una fase expresamente autorizada.
