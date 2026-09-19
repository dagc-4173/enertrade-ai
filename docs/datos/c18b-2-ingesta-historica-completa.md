# C18b-2 - Ingesta histórica completa XM 2024 a availableUntil

## Alcance y baseline

Ejecución sobre `HEAD` y `origin/main` `0349d2c2b4b111551234f8fc28dfd090ed33d47f`, con árbol limpio. Prisma reportó 11 migraciones aplicadas antes de iniciar. No se crearon migraciones, no se modificaron frontend, contratos de forecast, modelos o artefactos, y no se ejecutó reentrenamiento.

La fuente de todas las ventanas históricas nuevas fue el provider oficial `XM/SINERGOX` mediante `XmProvider`, entidad `Sistema`. No se incluyeron fixtures, datos demo, generación simulada ni datos sintéticos en los consolidados finales.

## Regla de localización

Backend, base de datos, API, hashes y modelos conservan números técnicos JavaScript `number`, punto decimal técnico, fechas ISO `YYYY-MM-DD` y unidades explícitas `kWh` o `COP/kWh`. No se almacenan símbolos monetarios ni cadenas como `1.234,56` o `245,10 COP/kWh`.

La localización `es-CO` queda exclusivamente para C18d/frontend o exportación: `Intl.NumberFormat("es-CO")`, moneda COP, coma decimal visual, punto de miles visual y fecha `dd/MM/yyyy`. No se aplicó formato local a JSON técnico, hashes ni modelos.

## Sondeo de disponibilidad

Antes de la ingesta se consultó `2026-09-12` a `2026-09-19` por métrica. Los resultados observados fueron:

| Métrica | Unidad | Granularidad | availableUntil | Filas del último día | Latencia |
| --- | --- | --- | --- | ---: | ---: |
| Gene | kWh | hourly | 2026-09-15 | 24 | 636 ms |
| DemaSIN | kWh | daily | 2026-09-16 | 1 | 176 ms |
| PrecBolsNaci | COP/kWh | hourly | 2026-09-15 | 24 | 178 ms |

No se observó 429, timeout ni 5xx durante el sondeo ni durante las ventanas históricas. Esto no constituye un SLA.

## Ventanas e importación

Las ventanas se generaron secuencialmente, inclusivas, de hasta 30 días, en el orden Gene, DemaSIN y Precio. No se paralelizaron métricas ni se efectuaron reintentos agresivos.

| Métrica | requestedFrom | requestedTo | Ventanas planificadas nuevas | Nuevas | Reusadas | Failed | Filas de ventanas incl. solape | Latencia min-max |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Gene | 2024-01-01 | 2026-09-15 | 33 | 33 | 0 | 0 | 23,808 | 959-1,532 ms |
| DemaSIN | 2024-01-01 | 2026-09-16 | 33 | 33 | 0 | 0 | 993 | 804-1,348 ms |
| PrecBolsNaci | 2024-01-01 | 2026-09-15 | 33 | 33 | 0 | 0 | 23,808 | 864-2,787 ms |

Antes existía por métrica una ventana controlada de `2024-01-01` a `2024-01-03`. La planificación histórica empieza con `2024-01-01` a `2024-01-30`, por lo que el consolidador recibió un solape intencional. Sus valores fueron idénticos y se deduplicaron por identidad canónica; no se creó un conflicto de datos.

## Continuidad, consolidados y preparados

| Métrica | Rango completo | Días completos | Filas consolidadas | Hash SHA-256 | Consolidado | EnergyDataset | PreparedDataset |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: |
| Gene | 2024-01-01 a 2026-09-15 | 989 | 23,736 | `e6664223f7efec6a267043eceba220db6a1eca99fe74858cb4f53e5971498775` | 4 | 118 | 55 |
| DemaSIN | 2024-01-01 a 2026-09-16 | 990 | 990 | `b3831995162136d696f93ff00797d04293831e5658548d8f511a3a1ec20e557f` | 5 | 152 | 56 |
| PrecBolsNaci | 2024-01-01 a 2026-09-15 | 989 | 23,736 | `634a2d4a9bf5bdc2caa99916326958ebdf3e1de1bd506687073391ec86b8bc53` | 6 | 186 | 57 |

Los tres consolidadores exigieron continuidad completa: Gene y Precio 24 períodos por día; DemaSIN una observación por día. No se detectaron huecos, duplicados ni conflictos. Los `EnergyDataset` consolidados `118`, `152` y `186` se validaron como `aprobado`; los PreparedDataset conservan respectivamente los perfiles/rulesets `xm_gene_preparacion_base@1.0.0`/`xm_gene_base@1.0.0`, `xm_demandasin_preparacion_base@1.0.0`/`xm_demandasin_base@1.0.0` y `xm_preciobolsnaci_preparacion_base@1.0.0`/`xm_preciobolsnaci_base@1.0.0`.

Las tres segundas materializaciones devolvieron el mismo ID, el mismo hash y `reused=true`.

## Procedencia verificable

La relación inversa verificada es `PreparedDataset → EnergyDataset consolidado → XmConsolidatedDataset → XmConsolidatedDatasetSource → XmIngestionWindow(completed) → EnergyDataset ventana`.

| Métrica | Ventanas fuente | Primera ventana/dataset | Última ventana/dataset |
| --- | ---: | --- | --- |
| Gene | 34 | 1 / 79 (`2024-01-01..03`) | 36 / 117 (`2026-08-18..2026-09-15`) |
| DemaSIN | 34 | 2 / 80 (`2024-01-01..03`) | 69 / 151 (`2026-08-18..2026-09-16`) |
| PrecBolsNaci | 34 | 3 / 81 (`2024-01-01..03`) | 102 / 185 (`2026-08-18..2026-09-15`) |

## Forecast readiness sin inferencia

No se ejecutaron modelos. Se verificó solo disponibilidad de los rezagos sobre los PreparedDataset nuevos:

| Métrica | Fecha candidata | Evidencia disponible |
| --- | --- | --- |
| Gene | 2026-09-15 | D-1 `2026-09-14` y D-7 `2026-09-08`, 24 períodos cada uno, incluido período 24 D-1 |
| DemaSIN | 2026-09-16 | D-1 `2026-09-15`, D-7 `2026-09-09`, D-14 `2026-09-02`, D-28 `2026-08-19` |
| PrecBolsNaci | 2026-09-15 | D-1 `2026-09-14`, 24 períodos completos |

Los modelos permanecen sin cambios: `xm-gene-ridge@1.0.0`, `xm-demandasin-ridge@1.0.0` y regla `xm-preciobolsnaci-b1@1.0.0`.

## Conteos de base de datos

| Entidad | Antes | Después | Explicación |
| --- | ---: | ---: | --- |
| EnergyDataset | 55 | 157 | 99 ventanas nuevas y 3 consolidados, además de registros preexistentes del baseline |
| PreparedDataset | 44 | 47 | Tres preparados de históricos completos |
| XmIngestionWindow | 3 | 102 | 99 ventanas históricas nuevas más las tres controladas existentes |
| XmConsolidatedDataset | 3 | 6 | Tres consolidados históricos completos |
| XmConsolidatedDatasetSource | 3 | 105 | 102 enlaces de los históricos completos más tres enlaces controlados preexistentes |

## Limitaciones y riesgos

- `availableUntil` es una observación del sondeo de esta ejecución; no es garantía de disponibilidad futura.
- La primera ventana histórica se superpone a la ventana controlada C18b-1; el consolidador la deduplicó, pero futuras ejecuciones deben planificar ventanas con conocimiento de rangos ya completed para evitar consultas redundantes.
- Se conserva como evidencia pendiente una carrera concurrente contra PostgreSQL real para el manejo de `P2002`; las pruebas automatizadas cubren el comportamiento con store simulado.
- No se aplicó localización visual ni se ejecutó forecast; ambas tareas quedan fuera de esta fase.