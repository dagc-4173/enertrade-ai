# ADR-12 — Precio de referencia de mercado XM

## Estado y contexto

Decisión adoptada; pipeline histórico implementado y probado técnicamente con
Express, XM y PostgreSQL reales. Validación académica/formal pendiente.

HU-08 requiere estimar un precio de referencia. El backend no dispone de ofertas
y demandas comerciales reales que permitan representar una negociación.
PrecBolsNaci está disponible mediante el proveedor XM/SINERGOX existente, con
registros por fecha y periodo y unidad COP/kWh.

## Alternativas y decisión

- Esperar datos comerciales: conserva el alcance comercial, pero requiere una
  fuente aún pendiente.
- Usar mocks: no constituye evidencia histórica real.
- Usar PrecBolsNaci: alternativa adoptada como base histórica del precio
  energético de referencia del mercado para el prototipo.

Este uso no es liquidación financiera, recomendación financiera ni precio
personalizado; no representa negociación comercial real. Oferta y demanda
comerciales siguen pendientes. No se selecciona todavía un algoritmo de precio.

## Contrato e implementación

`POST /external-data/import` admite `xm/PrecBolsNaci` y reutiliza
`ExternalDataService.query()` y `registerDataset()`. Registra `dataType=precios`
y columnas obligatorias `fecha_xm`, `periodo`, `precio_cop_kwh`, mapeadas desde
`date`, `hour`, `value`. Source conserva proveedor, métrica, unidad de la respuesta,
rango y `mapping=xm-preciobolsnaci-v1`. No ejecuta validación ni preparación automática.

HU-02 selecciona `xm_preciobolsnaci_base@1.0.0` por tipo y columnas compatibles,
no por source. Valida calendario, periodo entero 1..24, precio finito e identidad
única `(fecha_xm, periodo)`. Reutiliza los issues críticos, `INVALID_XM_DATE`,
`INVALID_XM_HOUR` (aplicado al campo periodo) y `DUPLICATE_XM_PERIOD`.
El guard estructural existente conserva el rechazo 409 de contenido vacío o no
finito; otros valores inválidos admitidos estructuralmente producen rechazo de calidad.
No exige signo positivo, día completo ni orden cronológico.

HU-03 selecciona `xm_preciobolsnaci_preparacion_base@1.0.0` con informe exacto
aprobado y coherente. Preserva orden, valores y `sourceRecordIndex`.
Según la convención existente, fecha se declara `type=string` con
`representation=YYYY-MM-DD`; periodo, `type=number` con
`representation=integer 1..24`; precio, `type=number`, `unit=COP/kWh`.
La identidad temporal usa los campos fecha y periodo. No infiere timestamps,
timezone o zona; no agrega precio diario, imputa, escala, redondea ni genera features.

Se conservan los selectores anteriores, la clave de idempotencia
`sourceDatasetId + profileId + profileVersion` y la recuperación P2002 existente.
No se modifica Prisma, frontend ni los modelos de oferta/demanda.

## Consecuencias y límites

La importación repetida puede crear otro EnergyDataset; la idempotencia corresponde
a la preparación. Un día importado no constituye corpus ML ni demuestra continuidad
histórica. Antes de modelar se necesitan corpus caracterizado, particiones,
protocolo y evaluación reproducibles. Los ceros y negativos se preservan.

Este incremento no completa HU-08. No existe aún modelo de precio ni endpoint de estimación.

La [evidencia técnica](../evidencias/hu-08-precio/pipeline-preciobolsnaci/README.md)
registra integración real, preservación e idempotencia, con sus límites.
