# C18b-0 - Sondeo controlado XM y estrategia de ingesta historica

**Fecha del sondeo:** 2026-09-18
**Alcance:** consultas XM de solo lectura mediante `XmProvider`; sin importacion, Prisma, modelos ni frontend.

## Fuente y contrato observado

Se uso `XmProvider` con la base oficial configurada `https://servapibi.xm.com.co`. Cada consulta usa `POST /hourly` o `POST /daily`, `MetricId`, `Entity=Sistema`, `StartDate`, `EndDate` y `Filter=[]`. El provider limita cada llamada a 30 dias inclusivos y normaliza las respuestas antes de entregarlas.

| Metrica | Unidad | Granularidad | Forma normalizada | Identidad canonica |
| --- | --- | --- | --- | --- |
| Gene | kWh | horaria | `{ date, hour: 1..24, value }` | `(fecha_xm, hora_xm)` |
| DemaSIN | kWh | diaria | `{ date, hour: null, value }` | `fecha_xm` |
| PrecBolsNaci | COP/kWh | horaria | `{ date, hour: 1..24, value }` | `(fecha_xm, periodo)` |

## Sondeo de disponibilidad reciente

La ventana solicitada fue `2026-09-11` a `2026-09-17`, siete dias. La disponibilidad indicada es observada en esta respuesta, no una garantia de publicacion futura.

| Metrica | Filas | Fechas recibidas | Ultima fecha completa (`availableUntil`) | Completitud | Latencia aprox. |
| --- | ---: | --- | --- | --- | ---: |
| Gene | 120 | 2026-09-11 a 2026-09-15 | 2026-09-15 | 5 dias x 24 periodos | 750 ms |
| DemaSIN | 6 | 2026-09-11 a 2026-09-16 | 2026-09-16 | 6 dias x 1 observacion | 163 ms |
| PrecBolsNaci | 120 | 2026-09-11 a 2026-09-15 | 2026-09-15 | 5 dias x 24 periodos | 173 ms |

XM no devolvio filas para Gene/Precio el 16-17, ni para DemaSIN el 17, dentro de la ventana solicitada. No se recibieron HTTP 429, timeout ni 5xx en las seis consultas de esta fase. Esto no demuestra ausencia de rate limits ni un SLA.

## Control de inicio solicitado

Cada metrica recibio una consulta independiente para `2024-01-01` a `2024-01-01`:

| Metrica | Filas | Resultado de completitud | Latencia aprox. |
| --- | ---: | --- | ---: |
| Gene | 24 | periodos 1..24 | 172 ms |
| DemaSIN | 1 | una observacion diaria | 162 ms |
| PrecBolsNaci | 24 | periodos 1..24 | 154 ms |

El control confirma servicio para ese dia concreto; no acredita que todo el intervalo intermedio este completo.

## Cobertura objetivo y volumen estructural

`requestedFrom` para la primera carga es `2024-01-01`. En una ejecucion C18b, `requestedUntil` debe ser el `availableUntil` medido otra vez al inicio, no los valores de esta tabla sin nueva comprobacion.

| Metrica | `availableUntil` observado | Dias inclusivos desde 2024-01-01 | Filas estimadas | Ventanas maximas de 30 dias |
| --- | --- | ---: | ---: | ---: |
| Gene | 2026-09-15 | 989 | 23,736 | 33 |
| DemaSIN | 2026-09-16 | 990 | 990 | 33 |
| PrecBolsNaci | 2026-09-15 | 989 | 23,736 | 33 |

Las filas son una estimacion de estructura completa, no un conteo de descarga historica ni aprobacion de calidad.

## Estrategia propuesta para C18b

- Usar ventanas inclusivas de 30 dias: la siguiente inicia en la fecha siguiente a `requestedTo`.
- Validar cada bloque antes de persistir: fechas, unidad, valores finitos, claves duplicadas y 24/1/24 observaciones por fecha segun la metrica.
- No rellenar dias o periodos ausentes. Una ventana incompleta debe quedar registrada como fallo o cobertura parcial conforme a la decision aprobada, nunca como cobertura completa.
- Aplicar deduplicacion principal y control de concurrencia en el manifiesto persistido, no en provider ni en normalizador. Estos solo validan una respuesta individual.
- Reanudar desde la primera ventana sin exito confirmado. Para carga incremental, iniciar en `persistedUntil + 1` despues de medir otro `availableUntil`.

La persistencia del manifiesto se implemento posteriormente en C18b-1 conforme a ADR-23. La evidencia de migracion, prueba controlada e idempotencia esta en `c18b-1-manifiesto-ingesta.md`.

## Limites conocidos

Los PreparedDataset actuales conservan el contenido completo como JSON y los forecasts leen un solo PreparedDataset. Antes de usar historicos multiventana en inferencia o C19 se debe decidir como crear un artefacto consolidado inmutable y medir memoria, serializacion JSON, tiempo de validacion/preparacion y tamano de payload. C18b-0 no realiza esa implementacion.

NASA POWER queda fuera de C18b conforme a ADR-15: es evidencia meteorologica separada y no un dataset energetico XM ni un target PV.
