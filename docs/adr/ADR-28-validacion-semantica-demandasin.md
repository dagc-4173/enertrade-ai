# ADR-28 — Validación semántica conservadora de DemaSIN

## Contexto

XM publica una observación diaria finita para DemaSIN. La cobertura estructural
consideraba completo un día con una fila, pero eso no acredita que el valor sea
semánticamente apto para preparación, entrenamiento o pronóstico. El 28 y 29 de
septiembre de 2026 XM publicó 138.000 kWh y 11.310 kWh después de valores del
orden de 217 millones kWh. No existe evidencia de conversión, parseo o unidad
incorrectos y los valores deben conservarse.

La primera implementación aplicaba un cutoff continuo: la anomalía del 16 de
septiembre hacía no utilizable todo el sufijo posterior. Esto descartaba once
días individualmente normales, del 17 al 27 de septiembre.

## Alternativas evaluadas

- Rango físico absoluto: descartado porque sería arbitrario y frágil ante cambios
  de escala o definición de la métrica.
- MAD o IQR aislados: robustos, pero pueden sobrerreaccionar cuando la dispersión
  reciente es pequeña y requieren una política adicional para MAD cero.
- Ratio contra mediana de 7 días: simple, pero más sensible a una semana atípica.
- Ratio contra mediana de 14 días: seleccionado por estabilidad frente a fines de
  semana y festivos, manteniendo un mínimo de 7 observaciones para arranque.
- Ratio combinado con MAD/IQR: pospuesto; añade complejidad sin cambiar la
  clasificación de caídas de varios órdenes de magnitud.
- Cutoff continuo: conservador, pero descarta observaciones posteriores normales.
- Exclusión puntual: preserva observaciones normales y exige validar cada muestra.
- Recuperación automática después de N días: descartada porque N no garantiza
  que los lags o ventanas móviles de una muestra eviten fechas excluidas.
- Estado de revisión: adoptado como estado interno de EnerTrade; no implica que
  XM haya declarado el dato provisional.

## Decisión

Para cada fecha D, ordenar las observaciones estructuralmente válidas y calcular
la mediana de hasta 14 días anteriores, con mínimo 7. Si la referencia es
positiva y `demanda(D) / mediana < 0,20`, registrar:

- código `WARNING_SEMANTIC_ANOMALY`;
- severidad `warning`;
- fecha, valor, mediana, ratio, tamaño de ventana, umbral e ID de regla;
- `semanticValidation.status=review_required`.

El umbral 0,20 se fijó antes de ejecutar casos sobre el 28 y 29 de septiembre.
Tolera caídas de hasta 80%, muy superiores a variaciones habituales de calendario,
y solo bloquea eventos extremos. No elimina, corrige ni imputa observaciones.

Cada observación se clasifica como `USABLE` o `SEMANTIC_REVIEW_REQUIRED`. Un
dataset con advertencias queda en estado `advertencia` y `canProceed=true` para
que HU-03 conserve todas sus filas. La preparación agrega metadata con regla,
última observación individualmente usable y fechas excluidas; no elimina filas
ni crea huecos silenciosos.

La decisión operativa es elegibilidad por observación más validación por muestra.
Una muestra runtime requiere que origen y todas sus fechas fuente sean `USABLE`.
Training/evaluation exige además target `USABLE`. Una media o desviación móvil
solo es elegible si todas las observaciones de su ventana son usables.

La cobertura distingue:

- `latestReceivedDate`: última fila persistida; gobierna idempotencia e ingesta;
- `latestIndividuallyUsableDate`: última observación individualmente usable;
- `semanticExcludedDates`: observaciones que requieren revisión;
- `eligibleFutureTargetDates`: targets futuros cuyas fuentes son usables;
- `latestObservationDate`: alias de compatibilidad, no afirmación de continuidad.

Los PreparedDataset históricos se vuelven a comprobar al solicitar un pronóstico
de demanda. Si cualquier lag requerido está excluido, solo esa muestra falla con
`FORECAST_SEMANTIC_DATA_UNAVAILABLE`; no hay imputación, fallback ni reemplazo de
fecha.

## Evidencia cruda del proveedor

La implementación actual conserva payload lógico en `source`, proveedor, fecha
de fetch, rango recibido y hash del contenido normalizado, pero no los bytes JSON
de XM. No se añade almacenamiento masivo en esta decisión.

La opción mínima recomendada para un incremento posterior es extender
`XmIngestionWindow` con:

- `requestPayload` JSON canónico;
- `rawResponseSha256`;
- `rawResponseMetadata` acotado a identidad de métrica, fechas, entidad y campos
  de estado que XM pueda incorporar;
- opcionalmente una referencia a evidencia externa inmutable, no el cuerpo
  completo duplicado en PostgreSQL.

El hash debe calcularse antes de normalizar y persistirse en la misma transacción
que el manifiesto. Requiere una modificación explícita del contrato del provider
para devolver evidencia de transporte; no se implementa parcialmente aquí.

## Consecuencias

- Se preserva cobertura estructural y trazabilidad de datos sospechosos.
- Datos sospechosos se preservan en HU-03, pero no pueden formar parte de una
  muestra de entrenamiento, evaluación o forecasting operativo.
- La regla detecta solo caídas severas; no detecta picos, mesetas o anomalías
  multivariadas.
- No existe flujo de aprobación manual todavía. Una revisión confirmada requerirá
  una decisión explícita y auditable, no editar los valores recibidos.