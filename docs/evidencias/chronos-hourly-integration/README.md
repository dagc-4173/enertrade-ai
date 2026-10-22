# Integración local experimental de Chronos para demanda horaria

Ambos modelos quedan conectados al backend y al panel de Predicciones: Chronos-2 y Chronos-Bolt Small. No reemplazan demanda diaria DemaSIN/Ridge, generación o precio. Son pronósticos agregados de DemaReal/Sistema, kWh por periodo, excluyendo alumbrado público.

## API y configuración

- `GET /forecasts/hourly-demand/models`: catálogo de ambos modelos, revisiones, disponibilidad de configuración y métricas históricas.
- `POST /forecasts/hourly-demand`: `{ "model": "chronos2", "targetDate": "YYYY-MM-DD" }`; también admite model `bolt`.

Ambos endpoints requieren sesión mediante el middleware existente. El POST solo admite modelo y fecha futura; no acepta rutas, scripts, URLs o parámetros del modelo. Primero consulta el contexto publicado en XM y exige 28 días consecutivos. Después genera todos los periodos desde el último día observado hasta el objetivo y devuelve los últimos 24, con cuantiles y mediana. Máximo siete días desde el último dato.

Variables de servidor, documentadas en `.env.example`: `CHRONOS_PYTHON_PATH`, `CHRONOS2_MODEL_PATH`, `CHRONOS_BOLT_MODEL_PATH` (rutas absolutas) y `CHRONOS_EVIDENCE_DIR`. Se configuraron localmente con el Python y checkpoints ya evaluados; no se instalaron dependencias. Paquete requerido por el worker: chronos-forecasting 2.3.2. Los pesos se verifican por SHA-256 y no se descargan durante consultas. El despliegue en otro host necesita provisionar Python y pesos; la configuración local no demuestra despliegue remoto.

Python se ejecuta sin shell, con límites de entrada/salida y timeout de 120 s para inferencia. Concurrencia máxima una ejecución por proceso backend. El frontend muestra error controlado si XM falla, faltan archivos, hay otra consulta o no se puede guardar evidencia. No hay fallback silencioso a snapshots ni caché de pronósticos. Puede requerirse reiniciar el backend para cargar las nuevas variables de entorno.

## Evidencia de ejecución

La evidencia local de cada consulta se conserva bajo CHRONOS_EVIDENCE_DIR (configurado como backend/data/chronos-forecasts), ignorada por Git. Incluye solicitud, discovery, inputs originales/catalogados, generado completo, resultado y manifiesto con hashes. Los fallos tienen registro separado y no se anuncian como resultados disponibles. No hay nueva migración, escritura de datasets Prisma ni actualización del modelo diario. La trazabilidad relacional HU-17 de esta capacidad queda pendiente; se entrega evidencia local por ejecución.

La prueba manual `backend/scripts/chronos-hourly-integration.ts` levanta solo el router en loopback. El límite de autenticación se sustituye expresamente para no usar sesiones ni PostgreSQL. La inferencia Python y checkpoints son reales. Sin argumentos consulta XM en vivo; con `--replay-inputs RUTA_CAPTURA_PROSPECTIVA` reproduce archivos previamente adquiridos y verificados. Este modo solo pertenece al script de comprobación, no añade fallback a la aplicación.

## Resultado verificado del 21 de octubre de 2026

- Tipos backend: aprobados.
- Cinco suites backend: 177 pruebas aprobadas, 0 fallidas, 731 aserciones. Incluyen servicio/ruta nuevos, adquisición y regresiones de oferta/demanda diaria.
- Dos suites frontend: 57 pruebas aprobadas, 0 fallidas, 218 aserciones. Incluyen ambos modelos, contrato, horizonte y vistas de resultado.
- Build y lint frontend: aprobados.
- Dos intentos HTTP en vivo fallaron con `EXTERNAL_TIMEOUT`, antes de Python; se conservaron sus directorios de evidencia. El contraste directo también agotó tiempos de espera con Bun y Python. No se atribuye una causa definitiva ni disponibilidad actual del proveedor.
- Reproducción de capturas XM reales de hoy, mediante HTTP local e inferencia real: Chronos-2 y Bolt respondieron HTTP 200 con 24 filas, target 22 de octubre, último dato 17 de octubre, horizonte cinco días, 120 periodos generados y 96 puente. Evidencia: `2026-10-21T06-37-10-263Z/verification.json` y respuestas por modelo. Aproximadamente 11.48 s y 10.67 s respectivamente en esa ejecución; no son SLA.

La prueba en reproducción valida HTTP→servicio→proceso Python→respuesta y persistencia de evidencia. No equivale a validar XM en vivo en ese instante, sesión real, navegación interactiva, despliegue o precisión prospectiva. El frontend fue comprobado por contratos, renderizado estático, lint y compilación; no se afirma una prueba manual de navegador.

## Matriz de pruebas

| ID | HU | Precondición | Pasos | Esperado | Resultado |
| --- | --- | --- | --- | --- | --- |
| CHR-01 | HU-06/18 | Dependencias sustituidas válidas | 1. Pedir ambos modelos. 2. Revisar salidas/manifiesto | 24 filas, puente explícito y persistencia | Aprobado |
| CHR-02 | HU-14/15 | Parámetros extra, fecha pasada o modelo inválido | 1. Solicitar. 2. Contar adquisición | Rechazo sin consulta | Aprobado |
| CHR-03 | HU-06/15 | Datos atrasados/configuración ausente | 1. Consultar. 2. Verificar error/disponibilidad | Error controlado; sin inferencia falsa | Aprobado |
| CHR-04 | HU-06 | Cuantiles corruptos | 1. Sustituir salida. 2. Solicitar | Rechazo | Aprobado |
| CHR-05 | HU-15 | Inferencia en curso | 1. Consultar simultáneamente. 2. Finalizar y repetir | Bloqueo temporal y liberación | Aprobado |
| CHR-06 | HU-14/20 | HTTP local/auth sustituida | 1. Consultar sin autorización. 2. Probar JSON válido/inválido | 401/200/400/415 según caso | Aprobado |
| CHF-01..03 | HU-06/07/14 | Contratos y renderizado estático | 1. Validar 24 periodos. 2. Renderizar selector y resultado | Dos opciones, métricas e intervalo limitado explícitos | Aprobado |
| CHRONOS-HTTP-REAL-01 | HU-14/20 | Snapshots reales verificados y Python configurado | 1. Reproducir inputs. 2. POST ambos modelos | 200 y 24 salidas por modelo | Aprobado en reproducción; XM en vivo pendiente |

## Límites y uso

Los cuantiles se declaran experimentales, sin calibración prospectiva acreditada. Las métricas históricas corresponden a julio–diciembre de 2025, horizonte H1 compartido con baselines; no garantizan desempeño H5 ni individual. Bolt extiende autoregresivamente cuando supera 64 periodos; el frontend advierte ese caso. No usar estos pronósticos para modificar automáticamente precios, matching o compromisos transaccionales.

ADR y consecuencias: docs/adr/ADR-29-chronos-hourly.md. La evolución de Chronos es un incremento de HU-06/07/14/15/18/20, sin declarar todas completas. La validación prospectiva, académica y en despliegue permanece pendiente. Conservar pruebas, manifiestos y cambios como evidencia TG-II. Codex apoyó significativamente diseño, implementación y verificación; revisión y comprensión por el estudiante pendientes.
