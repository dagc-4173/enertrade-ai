# C18d - Gráficas reales y localización es-CO

## Alcance

C18d incorpora visualizaciones en React a partir de los contratos existentes, sin modificar backend, modelos, históricos, migraciones ni contratos de pronóstico. Las series históricas proceden exclusivamente de `GET /energy-series` (C18c); los valores de pronóstico proceden de los endpoints reales existentes.

No hay datos sintéticos, `Math.random`, mocks runtime ni identificadores de datasets hardcodeados en los componentes. Los fixtures usados por las pruebas viven únicamente en `frontend/tests`.

## Localización

`frontend/src/utils/numberFormat.ts` centraliza el formato visual con `es-CO`:

- `formatNumberCO`
- `formatEnergyKWh`
- `formatPriceCOPPerKWh`
- `formatCurrencyCOP`
- `formatPercentCO`
- `formatDateCO`

La API conserva valores `number`, fechas ISO, `kWh` y `COP/kWh`. La interfaz los formatea al renderizar. Para precios energéticos se presenta, por ejemplo, `245,37 COP/kWh`, no solo un símbolo monetario. Dashboard, métricas de pronóstico, Patterns, Marketplace y consulta externa usan estas utilidades. Los resultados de matching convierten únicamente para presentación sus decimales validados y muestran cantidades sugeridas y pendientes con `formatEnergyKWh`; no alteran el contrato ni los estados `FULL`, `PARTIAL` y `NO_MATCH`.

## Cliente C18c

`frontend/src/services/energySeriesService.ts` implementa el cliente autenticado para `GET /energy-series`, con `credentials: include`, serialización tipada de `metric`, `from`, `to` y `granularity`, y validación runtime de:

- métrica, granularidad y unidad;
- cobertura, rango devuelto y conteo de puntos;
- puntos horarios con periodo 1 a 24;
- puntos diarios/mensuales sin periodo artificial;
- `sourceDatasetId`, `consolidatedDatasetId` y `contentHash`.

Los errores de autenticación, rango o granularidad permanecen como `ApiError` seguro para que la interfaz muestre el mensaje controlado del backend.

## Visualizaciones

Se agregó un SVG propio reutilizable (`SeriesChart`), porque el frontend no tenía librería de gráficas instalada y no se añadió ninguna dependencia. Cada gráfico expone título, descripción, unidad, leyenda textual, etiquetas del eje, tooltip nativo accesible en cada punto y estados explícitos de carga, vacío y error.

| Superficie | Datos reales y rango mínimo | Semántica |
| --- | --- | --- |
| Supply / Generación | Forecast `POST /forecasts/supply`; C18c `gene/hourly` de D-7 a D-1 | Compara las 24 horas de D-1, D-7 y forecast D. |
| Demand | Forecast `POST /forecasts/demand`; C18c `demand/daily` de D-30 a D-1 | Línea de demanda diaria observada más el único punto forecast D. No inventa horas ni cuatro líneas de rezagos. |
| Price | Forecast `POST /forecasts/price`; C18c `price/hourly` de D-1 | Compara 24 periodos observados y 24 estimados. Indica expresamente Regla determinista B1 y su coincidencia esperada con D-1. |
| Histórico energético | C18c bajo demanda | Filtros de métrica, fecha y granularidad. Gene y Price: hourly/daily/monthly; Demand: daily/monthly. Price diario/mensual declara que es promedio según C18c. |

Los límites se validan antes de consultar: 31 días inclusivos para hourly y 366 para daily. Mensual no limita días en el cliente, según el contrato C18c. La consulta histórica general inicia vacía y solo se solicita tras la acción explícita del usuario.

## Accesibilidad y responsive

Los SVG tienen `role="img"`, título y descripción vinculados; los puntos permiten foco de teclado y contienen texto accesible con fecha, periodo, valor y unidad. No se depende solo del color: la leyenda nombra cada serie y D-7/B1 usan trazos discontinuos.

Se limitan a seis etiquetas distribuidas en el eje X para evitar solape en series mensuales. A 390 px el documento, los paneles y el explorador no desbordan horizontalmente; las tablas de 24 períodos conservan su scroll interno dentro de `.table-wrap`.

## Evidencia ejecutada

Prueba visual autenticada contra backend local y PostgreSQL/Neon real el 2026-09-19:

| Caso | Entrada | Resultado observado |
| --- | --- | --- |
| Supply | Preparado 55, objetivo 2026-09-15 | 24 forecasts y gráfico con 72 puntos: D-1 14/09/2026, D-7 08/09/2026 y forecast D. |
| Demand | Preparado 56, objetivo 2026-09-16 | Forecast diario y gráfica con 30 observaciones XM previas más el punto D. |
| Price | Preparado 57, objetivo 2026-09-15 | 24 estimaciones B1 y 24 observaciones de 14/09/2026; series coincidentes sin desplazamiento artificial. |
| Histórico Gene | hourly, 2026-09-09 a 2026-09-15 | 168 puntos reales. |
| Histórico Demand | daily, 2026-08-17 a 2026-09-15 | 30 puntos reales. |
| Histórico Price | monthly, 2024-01-01 a 2026-09-15 | 33 puntos; dataset 186, consolidado 6, hash `634a2d4a9bf5bdc2caa99916326958ebdf3e1de1bd506687073391ec86b8bc53`. |

Se capturaron en la sesión una gráfica Supply y el histórico mensual Price. La última muestra formato colombiano, unidad visible, cobertura y procedencia del consolidado.

## Pruebas

- Cliente y formatters: serialización, Gene/Demand/Price, 401/400/413, `kWh`, `COP/kWh`, moneda, porcentaje y fecha.
- Gráfica reusable: datos, tooltip accesible, carga, vacío y error sin puntos falsos.
- Regresión de forecast y Marketplace: contrato de endpoints y formatos compartidos.
- Build incluye `tsc -b`; el proyecto no define un script de typecheck separado.

## Trazabilidad

| Relación | Estado |
| --- | --- |
| OE2/OE3, HU04 y HU05 | Visualización de pronóstico y métricas de generación; no altera modelo Ridge. |
| OE2/OE3, HU06 y HU07 | Visualización de demanda agregada SIN y métricas; no altera modelo Ridge. |
| OE2/OE3/OE4, HU08 y HU09 | Visualización de precio y trace existentes; se declara B1 como regla determinista, no IA/ML. |
| OE2/OE3, HU12/HU13 | Formato localizado de resultados de patrones; no agrega confidence ni anomalías. |
| C18c | Fuente única para historia real, cobertura y procedencia. |
| C18d | Requisito técnico/visual implementado. No corresponde a una HU nueva aprobada y debe incorporarse formalmente al backlog si se requiere su aceptación académica. |

## Limitaciones

- El gráfico histórico mensual no pagina ni resume en el servidor; respeta el contrato C18c actual.
- Las tablas de 24 períodos mantienen scroll horizontal interno en móvil para preservar encabezados y valores.
- La evidencia de sesión crea una cuenta temporal de prueba en el entorno de desarrollo remoto; no altera históricos ni modelos.