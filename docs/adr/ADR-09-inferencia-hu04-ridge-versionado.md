# ADR-09 — Inferencia HU-04 con Ridge versionado y generación XM como proxy

## Contexto

HU-01–HU-03 permiten registrar, validar y preparar generación XM. Validation del
experimento Ridge seleccionó alpha=0.01. La evaluación externa mantuvo alpha y
cinco features congelados y comprobó la regla de candidatura.
La regla predefinida del holdout se cumplió: MAE 329144.1790612068 kWh y RMSE
438880.23646857974 kWh, frente a B7 381967.83608333336 y 543845.1052233716.
Estos resultados pertenecen al experimento documentado, no a una nueva evaluación.

## Alternativas

- Mantener únicamente el baseline B7: referencia simple, superada bajo la regla externa.
- Entrenar durante la petición o consultar XM: introduce cambios de modelo y dependencia externa en inferencia.
- Servicio Python separado: posible evolución, innecesario para cinco productos escalares.
- Inferencia local TypeScript con artefacto JSON: opción adoptada, sin nuevas dependencias.

## Decisión

Promover los parámetros completos del Ridge evaluado, sin redondearlos, a
`backend/src/models/xm-gene-ridge/1.0.0/model.json`. Identidad xm-gene-ridge@1.0.0,
artefacto separado de evidencia, cargado desde ruta fija, validado una vez y
congelado recursivamente. Un fallo de carga se conserva hasta reiniciar el proceso;
no se sustituye el modelo ni se aceptan rutas desde HTTP.

POST /forecasts/supply admite exclusivamente preparedDatasetId y targetDate.
Parser JSON de 16 KiB. Lee directamente un PreparedDataset mediante Prisma;
no llama a prepareDataset, no escribe, no consulta XM y no entrena.
No cambia HU-01–HU-03 ni el schema. Las predicciones no se persisten.

Se exige xm_gene_preparacion_base@1.0.0 y xm_gene_base@1.0.0, variables y
contenido coherentes. targetDate debe ser posterior al último día de entrenamiento
(2024-03-30), incluso si existen datos más antiguos dentro del preparado.

Origen antes del periodo 1 del día D y horizonte de 24 periodos. Features:
D-1 mismo periodo, D-7 mismo periodo, periodo24 de D-1, sin/cos(2*pi*(h-1)/24).
Las 48 claves de D-1/D-7 deben existir dentro del único PreparedDataset solicitado.
No se buscan otros preparados ni se imputan faltantes. La ausencia produce 422
FORECAST_DATA_INSUFFICIENT con status unavailable, sin predicciones parciales.

Escalado poblacional y coeficientes permanecen fijos. Las observaciones válidas
del día objetivo/futuro no participan; sourceRecordIndex tampoco es feature.
El contenido completo se valida: registros corruptos o duplicados, incluso futuros,
se rechazan. No se generan timestamps. No se recortan valores negativos.

La salida generation_availability_proxy representa generación XM como proxy
técnico de disponibilidad energética, no ofertas transaccionales observadas.

## Verificación y consecuencias

Pruebas HTTP locales con lectura sustituida, paridad con cálculo offline CPython
3.14.4 math.fsum, tolerancia absoluta 1e-7 kWh, metadatos, fechas, faltantes,
corrupción, inmutabilidad y errores seguros. El fixture conserva 48 referencias
del snapshot externo para el objetivo 2024-04-08 y sus 24 predicciones offline.
La ejecución posterior con Express y PostgreSQL reales confirmó HTTP 200 para
PreparedDataset 17, fuente 36 y objetivo 2024-04-08. Las 24 predicciones fueron
finitas; el cálculo independiente desde SQL y model.json obtuvo diferencia máxima
de 0 kWh (< 1e-7). Esta integración es distinta de la paridad TS/Python automatizada
y no constituye otra evaluación predictiva del modelo.

Conteos y hashes del contenido completo de las tablas públicas permanecieron
iguales: EnergyDataset 7/7, PreparedDataset 7/7 y _prisma_migrations 3/3.
Se observaron rechazos controlados para fecha no soportada, historia insuficiente,
preparado inexistente y perfil incompatible. Regresión confirmada: 234 aprobadas,
0 fallidas, 909 aserciones; HU-04 aislada: 47 aprobadas. Typecheck y diff-check correctos.

Ver [pruebas reales HU-04](../evidencias/hu-04-forecast/pruebas.md).
Backend implementado y probado técnicamente; frontend HU-04 no implementado.
Validación académica/formal pendiente.

## Deuda técnica

- Historia limitada a un preparado: fronteras entre bloques pueden ser insuficientes.
- Disponibilidad completa de D-1 asumida; latencia real de publicación XM no verificada.
- Paridad entre runtimes con tolerancia, no igualdad binaria garantizada.
- Sin persistencia de predicciones ni registro de modelos en base de datos.
- Evaluación limitada al histórico observado; no acredita generalización anual.
- Distribuir el JSON junto al servidor y cambiar versión explícitamente al promover otro modelo.
- No se añade frontend ni se amplía el control de acceso en este incremento.
