# HU-08 — Inferencia de precio de referencia con B1

## Estado y alcance

**Implementada en backend. Probada técnicamente. Validación académica/formal pendiente. Frontend pendiente.**

Regla determinista versionada `xm-preciobolsnaci-b1@1.0.0`, no modelo ML.
Estima el precio horario de referencia de mercado D+1 mediante el mismo periodo
del día anterior. No representa precio personalizado, liquidación financiera,
recomendación financiera ni negociación comercial real. No utiliza ofertas o
demandas comerciales ni pronósticos HU-04/HU-06. Estos límites delimitan el
incremento de HU-08; no se afirma que existan esos datos comerciales.

## Regla y artefacto

Artefacto activo:
`backend/src/models/xm-preciobolsnaci-b1/1.0.0/rule.json`.

Fórmula: `prediction(D,p) = price(D-1,p)`, periodos enteros 1..24.
Unidad COP/kWh, granularidad hourly, horizonte un día. Sin scaler, coeficientes,
entrenamiento, timestamp/timezone inferido, promedio diario o confidence.
Los precios se copian numéricamente, sin redondeo, transformación ni restricción
de signo. Todas las referencias D−1 deben existir dentro del mismo preparado.

El artefacto conserva los hashes/rangos del corpus y holdout, métricas originales
de B1 en validation/test/holdout, criterio previo y passed=true. Procedencia:
[baselines](../baselines/README.md) y [holdout externo](../external-holdout/README.md).
Ridge permanece descartado y no se reabre selección.

- Corpus SHA-256: `07fdc38fa15929ff2bf8a6aefe0a3f2aa292276c5f18c8dbb0919be8537e0506`.
- Holdout SHA-256: `80f0732509f547e1a7766cd211c728aa7b636017ec0b0d8a5b34123e02910c6a`.
- MAE externo almacenado: 48.51072504166666 COP/kWh.
- Límite previamente establecido: 60.18714219696969 COP/kWh.

Loader independiente con lectura local fija, caché de éxito/fallo y freeze profundo.
Valida estrictamente todo el documento mediante SHA-256 de JSON canónico (claves
ordenadas, arrays en su orden, valores finitos), fijado para esta versión:
`8b9553fd303c4b6f3b2e87e62a369e08784c6c480d50800d63a7525be564fe7a`.
Campos añadidos, eliminados o modificados, incluidos identidad, rangos, hashes,
métricas y criterio, producen 409 seguro. La correspondencia con la evidencia se
comprueba en tests. No se calculan métricas desde observaciones en runtime.
Este checksum es control local de integridad, no firma de autenticidad de XM.
Una actualización del artefacto requiere revisión explícita de versión y checksum;
no hay selector de versiones proporcionado por el cliente.

## Contrato HTTP

`POST /forecasts/price`, Content-Type application/json, sin query params.

```json
{"preparedDatasetId":49,"targetDate":"2024-09-29"}
```

Body exacto de dos campos. ID entero positivo hasta 2147483647. targetDate debe
ser fecha calendario válida YYYY-MM-DD. Se admite cualquier fecha con D−1
completo dentro del preparado, incluso dentro de su rango; no se impone una
restricción de entrenamiento porque esta regla no se entrena.

Respuesta real (HTTP 200):

```json
{
  "status": "available",
  "preparedDatasetId": 49,
  "sourceDatasetId": 68,
  "forecastType": "market_reference_price",
  "target": "precio_cop_kwh",
  "unit": "COP/kWh",
  "granularity": "hourly",
  "horizonDays": 1,
  "rule": {
    "id": "xm-preciobolsnaci-b1",
    "version": "1.0.0",
    "type": "deterministic_baseline",
    "description": "same period previous day"
  },
  "targetDate": "2024-09-29",
  "predictions": [
    {
      "periodo": 1,
      "precio_cop_kwh": 915.15174
    },
    {
      "periodo": 2,
      "precio_cop_kwh": 889.15174
    },
    {
      "periodo": 3,
      "precio_cop_kwh": 888.01774
    },
    {
      "periodo": 4,
      "precio_cop_kwh": 888.01774
    },
    {
      "periodo": 5,
      "precio_cop_kwh": 889.15174
    },
    {
      "periodo": 6,
      "precio_cop_kwh": 889.15174
    },
    {
      "periodo": 7,
      "precio_cop_kwh": 889.15174
    },
    {
      "periodo": 8,
      "precio_cop_kwh": 889.15174
    },
    {
      "periodo": 9,
      "precio_cop_kwh": 889.15174
    },
    {
      "periodo": 10,
      "precio_cop_kwh": 889.15174
    },
    {
      "periodo": 11,
      "precio_cop_kwh": 889.15174
    },
    {
      "periodo": 12,
      "precio_cop_kwh": 934.61174
    },
    {
      "periodo": 13,
      "precio_cop_kwh": 889.15174
    },
    {
      "periodo": 14,
      "precio_cop_kwh": 934.61174
    },
    {
      "periodo": 15,
      "precio_cop_kwh": 934.62274
    },
    {
      "periodo": 16,
      "precio_cop_kwh": 934.62374
    },
    {
      "periodo": 17,
      "precio_cop_kwh": 934.62374
    },
    {
      "periodo": 18,
      "precio_cop_kwh": 934.62474
    },
    {
      "periodo": 19,
      "precio_cop_kwh": 934.62574
    },
    {
      "periodo": 20,
      "precio_cop_kwh": 934.62574
    },
    {
      "periodo": 21,
      "precio_cop_kwh": 934.62574
    },
    {
      "periodo": 22,
      "precio_cop_kwh": 934.62474
    },
    {
      "periodo": 23,
      "precio_cop_kwh": 934.62374
    },
    {
      "periodo": 24,
      "precio_cop_kwh": 934.62274
    }
  ],
  "factors": {
    "used": [
      "previous_day_same_period_price"
    ],
    "omitted": [
      "commercial_supply",
      "commercial_demand",
      "generation_forecast",
      "demand_forecast"
    ]
  },
  "scope": {
    "referencePrice": true,
    "personalized": false,
    "financialSettlement": false,
    "commercialNegotiation": false
  }
}
```

Reutiliza envelopes del router de forecasts:

| Condición | HTTP | Código |
| --- | --- | --- |
| Estructura, ID o campos/query no admitidos | 400 | INVALID_FORECAST_REQUEST |
| Fecha objetivo inválida | 422 | INVALID_FORECAST_DATE |
| PreparedDataset inexistente | 404 | PREPARED_DATASET_NOT_FOUND |
| Perfil/version o ruleset/version incompatible | 422 | FORECAST_PROFILE_NOT_APPLICABLE |
| D−1 ausente o incompleto | 422 | FORECAST_DATA_INSUFFICIENT |
| Contenido corrupto, periodo duplicado o precio no finito en D−1 | 409 | PREPARED_DATASET_INCONSISTENT |
| Artefacto ausente, inválido o incompatible | 409 | FORECAST_RULE_INCOMPATIBLE |
| Error inesperado | 500 | FORECAST_FAILED |

Historia insuficiente incluye `status=unavailable`. Los demás errores conservan
`error` y `message` seguros. El parser conserva 415 por tipo no admitido, 400 por
JSON malformado y 413 por superar 16kb. No se filtran detalles internos.

## Arquitectura

Router existente → price-forecast.service → loader B1 y una lectura
`prisma.preparedDataset.findUnique`. Exige perfil
`xm_preciobolsnaci_preparacion_base@1.0.0` y ruleset
`xm_preciobolsnaci_base@1.0.0`. Verifica variables/unidad y D−1; exige periodos
únicos exactos 1..24 y precios finitos. Devuelve 24 periodos ordenados.
Otros días no aportan precios ni sustituyen referencias ausentes.

No modifica HU-01/HU-02/HU-03, Prisma, migraciones o frontend.
Las predicciones no se persisten. El servicio no llama XM, preparación,
entrenamiento, oferta o demanda. El router comparte infraestructura HTTP con
otros forecasts, pero el cálculo de precio no depende de ellos.

## Prueba real Express + Prisma + PostgreSQL

Precondición: PreparedDataset **49**, source EnergyDataset **68**, rango del
preparado 2024-08-30..2024-09-28. No se crearon datos para esta prueba.
Se ejecutó la aplicación Express real desde un script temporal por stdin.

| ID | Acción | Esperado | Obtenido | Estado |
| --- | --- | --- | --- | --- |
| HU08-INT-01 | POST válido anterior | 200, regla B1, 24 precios de D−1 | 200, xm-preciobolsnaci-b1@1.0.0, 24 periodos | Probado |
| HU08-INT-02 | Proyección independiente del contenido SQL, sin reutilizar el servicio | Diferencia absoluta 0 para los 24 valores | Diferencia máxima 0 COP/kWh | Probado |
| HU08-INT-03 | Comparar tablas y preparado antes/después de todas las solicitudes | Sin inserts/updates/deletes | Conteos/hashes iguales; preparado intacto | Probado |

Primer valor: **915.15174 COP/kWh**; último: **934.62274 COP/kWh**.
Las 24 predicciones están conservadas en la respuesta anterior.
**No se observó uso del target ni de datos futuros en esta ejecución.**

Controles negativos HTTP reales, sin crear ni modificar datasets:

| Caso | Request | HTTP | Código observado |
| --- | --- | --- | --- |
| missing | `{"preparedDatasetId":2147483647,"targetDate":"2024-09-29"}` | 404 | PREPARED_DATASET_NOT_FOUND |
| missingPreviousDay | `{"preparedDatasetId":49,"targetDate":"2024-08-30"}` | 422 | FORECAST_DATA_INSUFFICIENT |
| invalidDate | `{"preparedDatasetId":49,"targetDate":"2024-02-30"}` | 422 | INVALID_FORECAST_DATE |
| extraField | `{"preparedDatasetId":49,"targetDate":"2024-09-29","ruleVersion":"2"}` | 400 | INVALID_FORECAST_REQUEST |
| geneProfile | `{"preparedDatasetId":14,"targetDate":"2024-09-29"}` | 422 | FORECAST_PROFILE_NOT_APPLICABLE |

El caso de D−1 incompleto y periodo duplicado se ejecutó con fixtures automatizados;
no se alteró PostgreSQL para provocarlos. Tampoco se corrompió el artefacto activo
en disco; sus fallos se probaron mediante loaders inyectados.

### Solo lectura e instrumentación

Durante las solicitudes, el script temporal interceptó pg.Client.query para
permitir únicamente SELECT y bloquear cualquier otra operación. También bloqueó
fetch hacia destinos externos y llamadas a XmProvider.query. No se modificaron
archivos productivos para instrumentar.

- SELECT observados durante las solicitudes: **4**.
- Intentos SQL de escritura: **0**.
- Fetch externos / llamadas XM: **0 / 0**.
- Preparación/entrenamiento: ausencia de dependencias y llamadas comprobada
  mediante revisión del servicio y prueba automatizada del límite de dependencias;
  no se atribuye a un contador runtime que no se instrumentó.

Hashes de las tablas públicas: cada fila se representa mediante JSON canónico,
se ordenan las representaciones y se calcula SHA-256. Se incluyen todos los
campos, por lo que la comparación abarca contenido, estados e informes.

| Tabla | Antes | Después | SHA-256 idéntico antes/después |
| --- | --- | --- | --- |
| EnergyDataset | 39 | 39 | aacf07e7394c501d5e3d73c9555dff284f989cabf0ea971a342baaa5e4cc067d |
| PreparedDataset | 39 | 39 | 3d81e9e869cad1c687d69e4a66e21e755953751396e1cd908f580e4056f2edb3 |
| _prisma_migrations | 3 | 3 | 57568ccbb192c7bccb491e6da70e508bc97761e815a2e594fdd899b87efa9727 |

PreparedDataset 49, hash canónico completo antes/después:
`62bb2038da79293b22af9355f1b5519997230f49a3a7df42de2caf568301b1ad`.

SHA-256 de los bytes de rule.json observados durante esta integración:
`a4af7371f8fabb7cfb7cfb6980433c06eeea1cea787b0edbad5e93b8801c6b34`.
Se distingue del checksum semántico del loader, que no depende del orden de
claves, formato o saltos de línea.

## Pruebas automatizadas y revisión

- `bun test src/tests/price-forecast.test.ts`: **57 aprobadas, 0 fallidas,
  150 aserciones**.
- `bun test`: **461 aprobadas, 0 fallidas, 1367 aserciones**, 9 archivos;
  incluye regresión de Gene/DemaSIN/PrecBolsNaci y HU-04/HU-05/HU-06/HU-07.
- `bun --bun run tsc --noEmit --incremental false -p tsconfig.json`: correcto.
- `git diff --check`: correcto.

Cobertura: contrato exacto, precisión/cero/negativo, D−1 y cruces calendario,
exclusión de precios de D/D+1, perfil, inexistente, historia ausente/incompleta,
duplicados, corrupción, request/parser, errores seguros, cache/freeze,
artefacto modificado/ausente, equivalencia con evidencia versionada, ausencia
de fetch/escritura/preparación/entrenamiento/HU-04/HU-06 en el servicio.
Las pruebas usan datos controlados; se distinguen de la integración real descrita.

## Limitaciones

La disponibilidad de D−1 completo es un supuesto explícito; no se garantiza
latencia de publicación XM en tiempo real. No se combinan preparados ni se
completan periodos. No hay confidence definido. El precio observado ayer no
garantiza el de mañana; el criterio externo no demuestra generalización
universal. Parte del test histórico fue observada previamente.
No se añade ML, entrenamiento, nuevas evaluaciones o lógica comercial.

Evidencia guardada: este documento, artefacto y tests. No se afirman capturas,
HAR u otros logs en archivos que no se conservaron. Sin commit.

