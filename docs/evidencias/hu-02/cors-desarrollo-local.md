# Comunicación HTTP de desarrollo local HU-01 y HU-02

Fecha: 2026-09-10. Estado: Probado mediante HTTP y PostgreSQL real.
No se ejecutó una prueba en navegador: la herramienta informó que no había
navegador disponible. Las solicitudes usaron explícitamente el Origin de Vite;
el cliente HTTP utilizado no aplica por sí mismo la política CORS del navegador.

## Precondiciones y cambio

Inicialmente no había servidores en 3000, 5173 o 5174. Se iniciaron Express
con `bun run index.ts` y Vite con
`npm.cmd run dev -- --host localhost --port 5173 --strictPort`.
El módulo servido por Vite inicialmente no contenía VITE_API_BASE_URL.

Antes del cambio, OPTIONS /datasets con Origin http://localhost:5173,
Access-Control-Request-Method POST y Access-Control-Request-Headers content-type
devolvió 200, texto POST, sin Access-Control-Allow-Origin ni Allow-Headers.
POST /datasets con JSON vacío devolvió 400 MISSING_REQUIRED_FIELD sin CORS;
POST /datasets/0/validate sin body devolvió 400 INVALID_VALIDATION_REQUEST sin CORS.

Se configuró VITE_API_BASE_URL=http://localhost:3000 en frontend/.env.local y
FRONTEND_ORIGIN=http://localhost:5173 en backend/.env. Se agregó un middleware
anterior a las rutas: coincidencia exacta de origen, Vary: Origin, método POST,
cabeceras Content-Type y Accept, OPTIONS 204. No autoriza credenciales ni usa *.
Se reinició Express; Vite recargó su configuración. Se comprobó la URL API
en el módulo apiClient.ts servido por Vite. No se modificó lógica de negocio.

## Pruebas y resultados

Todos los casos siguientes terminaron con las aserciones esperadas satisfechas.
Evidencia: salida del script ejecutado en memoria mediante `bun run -` en esta
sesión. El script no se agregó a la suite automatizada.

| ID | HU | Pasos | Esperado y obtenido |
| --- | --- | --- | --- |
| CORS-CONFIG | HU-01/HU-02 | Consultar módulo apiClient servido en 5173 | HTTP 200 y URL API http://localhost:3000 |
| CORS-PREFLIGHT | HU-01/HU-02 | OPTIONS a /datasets y /datasets/1/validate con Origin autorizado, método POST y cabecera content-type | 204, origen exacto, POST permitido, Content-Type permitido y Vary: Origin |
| CORS-OTHER-ORIGIN | HU-01/HU-02 | OPTIONS desde http://localhost:5174 y http://127.0.0.1:5173 | Sin Access-Control-Allow-Origin; no autorización CORS |
| HU01-CONTENT-TYPE | HU-01 | POST /datasets sin Content-Type y con text/plain | 415 con CORS |
| HU01-CORS-INT | HU-01 | Registrar JSON descrito abajo con Origin autorizado | 201, recibido, JSON y CORS |
| HU02-CORS-INT | HU-02 | Validar ID obtenido, sin body ni Content-Type; consultar fila PostgreSQL | 200, aprobado, canProceed=true, fecha persistida y contenido original intacto |
| HU02-REPEAT | HU-02 | Repetir validación del ID | 409 con CORS |
| HU02-BODY | HU-02 | Validar enviando body {} y application/json | 400 con CORS |
| CLEANUP | HU-01/HU-02 | Eliminar solo por source exclusivo e ID; contar coincidencias | 1 fila eliminada, 0 restantes |

Dataset temporal: source TGII-CORS-HU01-HU02-7f6b81ce-8449-4991-8af8-dfcace5ae390,
ID 12 en esta ejecución. Se comprobó ausencia previa del source.
Tipo generacion; columnas fecha y energia_kwh obligatorias, zona opcional.
Un registro: fecha 2026-09-10T12:00:00Z, energia_kwh 12.5,
zona prueba-controlada. La validación devolvió ruleset generacion_simulada_base
versión 1.0.0, validatedAt 2026-09-10T20:33:08.315Z, recordCount 1,
errorCount 0, warningCount 0, issues vacío.

`bun test`: 63 aprobadas, 0 fallidas, 270 aserciones. Esta suite sustituye Prisma;
no demuestra la corrección del P2002 real de HU-03. No se modificó esa HU.
El driver emitió una advertencia sobre semántica futura de sslmode;
la conexión y las aserciones finalizaron correctamente. No se modificó SSL.
