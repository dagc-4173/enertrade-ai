# C18c - API interna de series históricas reales

## Alcance

Se implementó `GET /energy-series` para que un consumidor interno autenticado consulte exclusivamente los corpus XM consolidados y materializados en C18b-2. La ruta no consulta ventanas individuales, no modifica datos históricos, no usa `PreparedDataset` y no expone frontend.

La fuente es el `EnergyDataset` canónico asociado a un `XmConsolidatedDataset`: conserva los valores originales normalizados, su cobertura declarada y el `contentHash` de trazabilidad. La selección exige que el consolidado cubra por completo el rango y es determinista: menor inicio de cobertura, mayor fin y luego mayor identificador.

## Autenticación y consulta

La ruta está protegida por `requireAuth()`. El cliente debe enviar la cookie de sesión `enertrade_session` obtenida al iniciar sesión. Sin sesión responde `401` con el contrato de autenticación existente.

```http
GET /energy-series?metric=gene&from=2026-09-09&to=2026-09-15&granularity=hourly
```

Los cuatro parámetros son obligatorios y no admite claves adicionales:

| Parámetro | Valores | Descripción |
| --- | --- | --- |
| `metric` | `gene`, `demand`, `price` | Generación, demanda SIN o precio de bolsa nacional. |
| `from` | fecha ISO `YYYY-MM-DD` | Inicio inclusivo. |
| `to` | fecha ISO `YYYY-MM-DD` | Fin inclusivo; debe ser igual o posterior a `from`. |
| `granularity` | `hourly`, `daily`, `monthly` | Resolución solicitada. |

`gene` y `price` permiten las tres granularidades. `demand` solo permite `daily` y `monthly`: la demanda XM disponible es diaria y la API no inventa períodos horarios.

## Semántica y formato

Los valores se retornan como `number` sin formato regional. Las fechas usan ISO y las unidades se preservan como `kWh` o `COP/kWh`. La localización `es-CO` corresponde a la futura interfaz o exportación, no a este contrato.

| Métrica | Horaria | Diaria | Mensual |
| --- | --- | --- | --- |
| `gene` | Valores `energia_kwh` por `hora_xm` | Suma de las 24 observaciones del día | Suma de las observaciones del mes |
| `demand` | No permitida | Valor canónico `demanda_kwh` | Suma de los valores diarios del mes |
| `price` | Valores `precio_cop_kwh` por `periodo` | Media aritmética de los períodos del día | Media aritmética de las observaciones del mes |

Una respuesta exitosa incluye metadata de cobertura y trazabilidad:

```json
{
  "metric": "gene",
  "unit": "kWh",
  "granularity": "hourly",
  "requestedFrom": "2026-09-09",
  "requestedTo": "2026-09-15",
  "returnedFrom": "2026-09-09",
  "returnedTo": "2026-09-15",
  "coverage": {
    "availableFrom": "2024-01-01",
    "availableUntil": "2026-09-15"
  },
  "pointCount": 168,
  "sourceDatasetId": 118,
  "consolidatedDatasetId": 4,
  "contentHash": "e6664223f7efec6a267043eceba220db6a1eca99fe74858cb4f53e5971498775",
  "points": [
    { "date": "2026-09-09", "period": 1, "value": 9992593.63 }
  ]
}
```

Los puntos horarios contienen `date`, `period` y `value`. Los diarios y mensuales contienen solamente `date` y `value`.

## Límites y errores

Para evitar respuestas excesivas, `hourly` permite como máximo 31 días inclusivos (744 puntos fuente) y `daily` 366 días inclusivos. La granularidad `monthly` no tiene límite por días porque el corpus histórico disponible produce un número acotado de meses; la respuesta agrega los datos en memoria después de leer el corpus consolidado correspondiente.

| Estado | Código | Significado |
| --- | --- | --- |
| 400 | `INVALID_ENERGY_SERIES_QUERY` | Parámetros faltantes, adicionales o inválidos; o rango de fechas inválido. |
| 400 | `UNSUPPORTED_ENERGY_SERIES_GRANULARITY` | Granularidad no aplicable a la métrica. |
| 401 | `UNAUTHENTICATED` | No existe sesión autenticada. |
| 404 | `ENERGY_SERIES_UNAVAILABLE` | No hay consolidado que cubra íntegramente el rango. |
| 413 | `ENERGY_SERIES_RANGE_TOO_LARGE` | Se excedió el límite para granularidad horaria o diaria. |
| 500 | `ENERGY_SERIES_FAILED` | Error inesperado, sin detalles internos en la respuesta. |

## Evidencia técnica

Pruebas de contrato ejecutadas: `bun test src/tests/energy-series.test.ts`, con 6 casos aprobados y 21 aserciones. Incluyen autenticación, las tres métricas, agregaciones, orden, cobertura, límites, indisponibilidad y envelope seguro ante error inesperado. `bun run typecheck` también aprobó.

Las siguientes lecturas reales, de solo lectura, se ejecutaron contra los consolidados C18b-2:

| Consulta | Resultado | Tiempo observado |
| --- | --- | --- |
| Gene hourly, 2026-09-09 a 2026-09-15 | 168 puntos; consolidado 4; dataset 118 | 2233.05 ms |
| DemaSIN daily, 2025-09-17 a 2026-09-16 | 365 puntos; consolidado 5; dataset 152 | 152.66 ms |
| Precio monthly, 2024-01-01 a 2026-09-15 | 33 puntos; consolidado 6; dataset 186 | 432.84 ms |

La primera consulta incluyó el establecimiento de conexión hacia PostgreSQL/Neon, por lo que no representa una latencia sostenida de solicitudes ya conectadas. En los tres casos se verificaron fechas ISO, valores `number`, unidades canónicas y el hash de contenido del consolidado.

## Relación con historias y pendientes

Esta entrega habilita el consumo interno de la historia que requiera visualización de series históricas reales (C18c). La interfaz de gráficas queda deliberadamente pendiente para C18d. No se reentrenaron modelos, no se alteraron contratos de inferencia y no se añadieron migraciones.