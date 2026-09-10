# Registro HU-01 desde el servicio frontend

Fecha: 2026-09-10. Implementado: panel Registrar dataset en Inicio, servicio
datasetService y contratos TypeScript separados. Se reutilizan panel, botones,
SectionHeader, StatusBadge y DataTable. No existía pantalla de carga. Los mocks
de mercado, métricas, recomendaciones y gráficos del Dashboard se conservan.
Los ejemplos JSON son entradas controladas, no respuestas simuladas.

## Alcance y criterios

- HU-01 exitoso: POST /datasets y presentación de los siete campos reales de
  respuesta 201, con estado recibido.
- HU-01 alternativo: opcionales pendientes conservados y mostrados por índice,
  campo y motivo devueltos por el servidor.
- HU-01 excepción: error estructural 400 y mensaje seguro del backend.
- Estados UI implementados: idle, loading, success y error. Se bloquea el envío
  durante loading y tras success hasta editar la entrada. No hay reintento automático.
- El editor solo comprueba sintaxis JSON; la estructura y reglas de negocio se
  validan en Express. No hay CSV ni llamadas a validate o prepare.
- Resultados del panel pertenecen a su sesión montada; no hay listado histórico
  ni recuperación tras recarga o navegación. Los registros persisten en la base.

## Ejecución real

Precondiciones: Vite localhost:5173, Express localhost:3000 y PostgreSQL
configurada. Se leyó VITE_API_BASE_URL del módulo servido por Vite. Se importaron
el datasetService, apiClient y ejemplos reales del frontend desde un script Bun
en memoria. No se sustituyó fetch en las solicitudes al backend: un envoltorio
añadió Origin http://localhost:5173 y delegó al fetch nativo.

No hubo navegador disponible. Esta prueba acredita servicio frontend → HTTP →
Express → PostgreSQL; no acredita interacción visual ni política CORS aplicada
por un navegador. La comprobación CORS previa está en el expediente HU-02.

| ID | Pasos | Resultado esperado y obtenido | Estado |
| --- | --- | --- | --- |
| HU01-FE-01 | Registrar datasetExample con source exclusivo; consultar fila por ID y comparar contenido/metadatos | 201; ID 13; recibido; recordCount 1; pendientes []; uploadedAt 2026-09-10T20:37:55.915Z; contenido íntegro; validación nula | Probado |
| HU01-FE-02 | Registrar pendingDatasetExample con source exclusivo y zona null; consultar fila | 201; ID 14; recibido; recordCount 1; pendiente {recordIndex:0,field:zona,reason:empty_optional_field}; uploadedAt 2026-09-10T20:37:56.623Z; persistencia coincidente | Probado |
| HU01-FE-03 | Enviar records:[] desde registerDataset; contar filas por source | 400 INVALID_DATASET_FORMAT; mensaje «records debe ser un array no vacío.»; cero filas | Probado |
| HU01-FE-415 | apiRequest POST /datasets con text/plain | 415; mensaje «Se requiere Content-Type application/json.» preservado | Probado |
| HU01-FE-500 | postJson contra servidor HTTP temporal que devuelve el envelope 500 del contrato | ApiError status 500; serverMessage «No fue posible registrar el dataset.» | Probado con respuesta controlada |

El 500 no fue provocado en PostgreSQL. El caso HU01-07 de la suite backend
también verifica el error de persistencia mediante Prisma sustituido.

Sources exitosos:
- TGII-HU01-FRONT-8c04e7da-e86b-490d-879f-b46bc5f1e067-valid
- TGII-HU01-FRONT-8c04e7da-e86b-490d-879f-b46bc5f1e067-pending

Se comprobó ausencia previa y se eliminaron únicamente las dos filas de prueba
por sus sources exclusivos en finally: 2 eliminadas, 0 restantes. Los IDs son
propios de esta ejecución; no se usan como valores fijos en la aplicación.
La primera ejecución falló al comparar el mensaje 400 por codificación del
literal esperado en PowerShell (vac?o). Se corrigió solo el script usando escape
Unicode y se repitió el caso: pasó con source
TGII-HU01-FRONT-INVALID-6fd0f109-a6f8-4563-a46c-615befe49d3a, sin inserción.
También se completaron 415 y 500. No se cambió la aplicación para ocultar el fallo.

## Comandos y resultados

- Backend: `bun test`: 63 aprobadas, 0 fallidas, 270 aserciones; Prisma sustituido.
- Frontend: `tsc.cmd -p tsconfig.app.json --noEmit --incremental false`: correcto.
- Frontend: `tsc.cmd -p tsconfig.node.json --noEmit --incremental false`: correcto.
- Frontend: `npm.cmd run lint`: correcto.
- Frontend: `npm.cmd run build`: correcto, 36 módulos transformados.
- Integración: scripts en memoria con `bun run -`; salidas conservadas en la sesión.
- No se instalaron dependencias ni se modificó backend, Prisma o migraciones.

## Capturas pendientes para TG-II

1. Inicio con el panel, ejemplo JSON y estado inicial.
2. Registro válido: panel con ID, fuente, tipo, fecha, recibido, cantidad y sin
   pendientes; Network con POST /datasets, payload y respuesta 201 coincidentes.
3. Opcional pendiente: seleccionar el ejemplo, cambiar source por uno exclusivo,
   registrar y capturar la tabla con zona/índice 0/empty_optional_field y el 201.
4. Estructura inválida: editar records a []; capturar el mensaje backend y 400
   en Network, sin resultado exitoso inventado.
5. Estado loading con limitación de velocidad de red, botón deshabilitado.
6. Conservar salida de pruebas, consulta PostgreSQL de los nuevos IDs y commit
   del cambio. No publicar credenciales al capturar configuración o consultas.

La revisión visual y la validación formal/académica permanecen pendientes.
