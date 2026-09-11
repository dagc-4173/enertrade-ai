# Integración frontend de validación HU-02

Fecha: 2026-09-10. La acción Validar calidad se incorpora debajo del registro
confirmado de HU-01 en Inicio, usando exclusivamente su ID real. El frontend
envía POST /datasets/:id/validate sin body ni Content-Type y presenta el informe
sin calcular reglas, contadores o canProceed. Los distintivos APROBADO,
ADVERTENCIA y RECHAZADO son presentación; status conserva el valor original.
El estado recibido se identifica como Estado al registrar, no estado actual.

## Estado final

HU-01 y HU-02: implementadas, probadas e integradas al frontend. Tras conectar
Chrome se ejecutaron los tres escenarios mediante el formulario React real,
sin sustituir HTTP ni Prisma. Los informes mostrados se contrastaron con
PostgreSQL y coincidieron. Inicialmente no había navegador disponible; esa
limitación quedó resuelta. El cierre documental y la limpieza se completaron
el 2026-09-11; las fechas de ejecución de interfaz constan abajo en UTC.
No se modificó backend ni se integró HU-03.

## Pruebas HTTP ejecutadas

Precondiciones: Express localhost:3000, Vite localhost:5173, PostgreSQL
configurada, sources temporales ausentes. Script Bun en memoria importando los
servicios frontend registerDataset/validateDataset y los ejemplos de la UI.
Se añadió Origin http://localhost:5173 al fetch nativo. Se comprobó que las
solicitudes de validación no llevaran body ni Content-Type.

Pasos comunes: registrar por HTTP; leer fila recibido y sin validación; validar
el ID devuelto; comparar informe, estado y fecha con PostgreSQL; comprobar
contenido y pendingOptionalFields intactos. No se sustituyó Prisma.

| ID prueba | Entrada | ID dataset | Resultado esperado y obtenido | Estado |
| --- | --- | --- | --- | --- |
| HU02-FE-01 | Ejemplo válido, zona norte | 15 | Registro 201; validación 200 aprobado; canProceed=true; 1 registro; 0 errores; 0 advertencias; issues=[] | Probado por HTTP |
| HU02-FE-02 | Ejemplo con zona null | 16 | Registro 201; validación 200 advertencia; canProceed=true; 1 registro; 0 errores; 1 advertencia OPTIONAL_VALUE_MISSING en zona, índice 0 | Probado por HTTP |
| HU02-FE-03 | Ejemplo válido con energia_kwh string "12.5" | 17 | Registro 201; validación 200 rechazado; canProceed=false; 1 registro; 1 error CRITICAL_TYPE_MISMATCH en energia_kwh, índice 0; 0 advertencias | Probado por HTTP |

Los tres informes coinciden con PostgreSQL. Ruleset generacion_simulada_base,
versión 1.0.0. validatedAt: 2026-09-10T20:43:54.462Z,
2026-09-10T20:43:55.082Z y 2026-09-10T20:43:55.688Z, respectivamente.

Sources: prefijo TGII-HU02-FRONT-f87f7233-2301-47bb-b909-203cab45b1e2,
sufijos -approved, -warning, -rejected y -unsupported.

Errores verificados mediante el servicio frontend:
- Revalidar ID 15: 409 DATASET_ALREADY_VALIDATED, mensaje seguro conservado.
- ID 0: 400 INVALID_VALIDATION_REQUEST, mensaje seguro conservado.
- Registrar consumo (ID 18) y validar: 422 RULESET_NOT_APPLICABLE.
- Eliminar solo el dataset temporal ID 18/source y validar su ID: 404 DATASET_NOT_FOUND.
- Servidor HTTP temporal con envelope controlado: 500 DATASET_VALIDATION_FAILED;
  no se provocó fallo real en la base ni se modificó el backend.

Limpieza: ID 18 eliminado específicamente para probar 404; las otras tres filas
eliminadas por sus sources exclusivos en finally; cero coincidencias restantes.
Los IDs no son valores fijos de la aplicación. Evidencia: salida del script en
memoria `bun run -` en la sesión, que concluyó con código 0.

## Pruebas automatizadas y compilación

- `bun test` en backend: 63 aprobadas, 0 fallidas, 270 aserciones. Prisma sustituido.
  Incluye casos de corrupción 409, IDs/body 400 y fallos 500; no corrige P2002 real.
- Typecheck frontend app y node con `tsc.cmd -p ... --noEmit --incremental false`: correcto.
- `npm.cmd run lint`: correcto.
- `npm.cmd run build`: correcto; 37 módulos transformados.

## Prueba de interfaz ejecutada en Chrome

Origen: http://localhost:5173; backend configurado en http://localhost:3000.
Se editaron datos controlados en Dataset en JSON y se pulsaron Registrar dataset
y Validar calidad. El ID de validación siempre fue el devuelto por HU-01.
Se observaron Registrando y Validando con controles deshabilitados. No se
invocaron los endpoints desde consola para estos tres casos.

| Prueba | ID | uploadedAt UTC | validatedAt UTC | Resultado mostrado y confirmado en PostgreSQL |
| --- | --- | --- | --- | --- |
| HU02-UI-01 | 19 | 2026-09-10T21:02:16.531Z | 2026-09-10T21:02:28.670Z | aprobado, canProceed=true, 1 registro, 0 errores, 0 advertencias, issues=[] |
| HU02-UI-02 | 20 | 2026-09-10T21:03:00.824Z | 2026-09-10T21:03:12.515Z | advertencia, canProceed=true, 0 errores, 1 advertencia OPTIONAL_VALUE_MISSING, zona, índice 0 |
| HU02-UI-03 | 21 | 2026-09-10T21:03:39.738Z | 2026-09-10T21:03:51.840Z | rechazado, canProceed=false, 1 error CRITICAL_TYPE_MISMATCH, energia_kwh, índice 0, 0 advertencias |

Estado de las tres pruebas: **Probado mediante interfaz y PostgreSQL real**.
Sources exclusivos: TGII-HU02-CHROME-20260910-2102-aprobado,
TGII-HU02-CHROME-20260910-2102-advertencia y
TGII-HU02-CHROME-20260910-2102-rechazado.
Entrada común: generacion; fecha 2026-09-10T12:00:00Z; energia_kwh 12.5;
zona norte. En advertencia zona=null; en rechazo energia_kwh="12.5".
Ruleset: generacion_simulada_base, versión 1.0.0.

La consulta posterior comprobó ID/source, estado, validatedAt, todos los issues,
contadores y ruleset contra la interfaz. El original conservó zona null o la
energía string cuando correspondía. Tras las aserciones se eliminó cada fila
usando simultáneamente ID y source: 1 por caso, 3 en total; cero coincidencias
restantes. No se eliminaron filas ajenas. La salida quedó en la sesión.

Se tomaron capturas de los tres resultados en Chrome y se mostraron en la
conversación. No se guardaron archivos PNG ni un HAR en el repositorio.
La prueba de navegador confirma el recorrido React → registro → PostgreSQL →
validación → resultado React; no se conserva una captura del panel Network.

## Guía para reproducir y conservar evidencia

Abrir exactamente http://localhost:5173. En Inicio:
1. Ejemplo válido; usar source exclusivo; Registrar dataset; guardar ID y respuesta
   201; Validar calidad; capturar APROBADO y el informe completo con HTTP 200.
2. Ejemplo con opcional pendiente; source distinto; registrar y validar; capturar
   ADVERTENCIA, canProceed=true y el issue de zona.
3. Ejemplo válido; source distinto; cambiar energia_kwh a "12.5"; registrar y
   validar; capturar RECHAZADO, canProceed=false y el issue crítico.

Para cada caso guardar captura React, Network con ambas solicitudes y respuestas,
ID coincidente, consulta PostgreSQL y registro de limpieza. Conservar también
estado loading/botón deshabilitado, salida automatizada y commit. Guardar las
capturas mostradas en la conversación; para un HAR o capturas de Network será
necesaria otra ejecución con nuevos IDs. Validación formal/académica: Pendiente.
