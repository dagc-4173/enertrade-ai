# Predictions: integración real para demostración

La página usa exclusivamente EnerTrade API mediante forecastService y apiClient
(`VITE_API_BASE_URL`). No consulta XM directamente ni importa mockData.
Se mantienen paneles, botones y tabla de la UI existente. No modifica backend.

## Selección de datasets preparados

Cada panel consulta `GET /prepared-datasets` y presenta únicamente los perfiles
y rulesets compatibles con su capacidad. No se usan IDs preparados fijos. Si no
hay elementos compatibles, la interfaz indica preparar un dataset antes de
solicitar el pronóstico. Cambiar la selección retira el resultado anterior; el
backend conserva la decisión final de suficiencia y compatibilidad.

## Endpoints y flujo

- POST /forecasts/supply: modelo/version y 24 valores energia_kwh.
- GET /forecasts/supply/metrics: métricas del artefacto activo.
- POST /forecasts/demand: modelo/version y demanda_kwh diaria; confianza no definida.
- GET /forecasts/demand/metrics: métricas del artefacto activo, alcance SIN.
- POST /forecasts/price: regla/version, 24 precios COP/kWh y trace HU-09.

Solo se cargan automáticamente las métricas (GET sin body/query). Cada POST
requiere pulsar el botón; se bloquean duplicados mientras esté pendiente. Una
consulta de precio, incluido un reintento, puede crear una nueva ejecución HU-09.
Abortar al salir no garantiza cancelar una ejecución ya iniciada en el servidor.

Oferta es generación como proxy de disponibilidad, no oferta transaccional.
Demanda es agregada del SIN, no individual/zonal. Precio usa B1 determinista,
no un modelo ML ni una negociación/liquidación financiera. No hay métricas de
precio conectadas porque no existe un GET correspondiente en este alcance.
MAE/RMSE/bias/WAPE corresponden al holdout documentado por el backend, no a la
solicitud recién ejecutada. trainedAt no registrado se muestra como tal.

La UI conserva el precio técnico aunque trace.persistence sea failed, y advierte
del fallo. No inventa un executionId. ApiError conserva HTTP/código/mensaje seguro;
un cuerpo inválido o problema de red genera error visible sin datos de respaldo.
Los parsers validan identidad de petición, unidades, periodos y estructura de
métricas, sin reproducir reglas de inferencia.

## Validación ejecutada

Sin instalar dependencias. Se usa Bun 1.3.13 ya disponible en el proyecto:

```text
cd frontend
npm run test
npx tsc -b --pretty false
npm run lint
npm run build
```

28 pruebas, 0 fallos, 45 aserciones: parseo, errores HTTP, red/no JSON, trace de
precio persistido/fallido, métricas de ambos modelos, rechazo de respuestas
inválidas y render inicial sin resultados/recomendaciones mock. Las llamadas
externas están sustituidas. El render se prueba con react-dom/server; no equivale
a una prueba de interacción en navegador. Typecheck, lint y build correctos.

Además, un script temporal llamó a las cinco funciones frontend contra la app
Express real y PostgreSQL (sin mocks), usando los ejemplos anteriores:

- Oferta: xm-gene-ridge@1.0.0; 24 periodos; primero 8480559.56339466,
  último 9173742.924577693 kWh.
- Demanda: xm-demandasin-ridge@1.0.0; 209373807.41127455 kWh.
- Precio: xm-preciobolsnaci-b1@1.0.0; primero 915.15174,
  último 934.62274 COP/kWh; trace persistida
  `ddba6f35-a6cb-4e39-bc15-81fe687913bd`.
- Métricas oferta/demanda: parseadas correctamente; identidad/versión coinciden
  con cada pronóstico. No se recalcularon métricas ni se entrenó.
- PriceForecastExecution pasó de 5 a 6 por esa única consulta de precio.

No se presenta este script como prueba desde navegador ni de CORS. Antes de la
demo, abrir Predictions con backend accesible, verificar VITE_API_BASE_URL y
FRONTEND_ORIGIN para el origen Vite utilizado y ejecutar los tres formularios.
Conservar la traza de precio si se captura evidencia; no repetir sin necesidad.

No hay gráficas nuevas, recomendaciones IA ni historial de trazas en esta
integración de pronósticos.
Validación académica/formal pendiente. Sin commit automático.
