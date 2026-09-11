# Consulta de fuentes externas: XM

Incremento de infraestructura de consulta, sin importar a EnergyDataset, integrar
frontend ni ejecutar modelos. Apoya la futura adquisición de datos para HU-01 y
las necesidades de generación, demanda y precio de HU-04/HU-06/HU-08; no completa
esas historias ni modifica los contratos o servicios de HU-01/HU-02/HU-03.

## Diseño y configuración

- `types/external-data.ts`: contrato común del proveedor, consultas y resultados.
- `external-data.service.ts`: catálogo controlado y validación de entrada.
- `providers/xm.provider.ts`: transporte fetch y normalización específica de XM.
- `../controllers/external-data.controller.ts`: endpoints y envelopes seguros,
  con parser JSON propio (16 KiB). Se monta antes del parser global de Express.
- `XM_API_BASE_URL=https://servapibi.xm.com.co` en backend; ese es también el
  valor predeterminado. Solo se admite esa base HTTPS oficial (con o sin slash
  final), sin credenciales, query ni fragmento. Un cambio de host de XM requiere
  revisar la lista permitida. No se siguen redirecciones.
- Timeout fijo de 15 segundos, incluyendo lectura del cuerpo; se aborta fetch.
- Sin SDK, nuevas dependencias, reintentos automáticos, cache ni escrituras.
  El transporte se inyecta en pruebas; no se sustituye el fetch global.

## Contrato público

`GET /external-data/providers` devuelve `{ providers: [{ id, name, datasets }] }`.
Solo contiene `xm`. Cada dataset expone `id`, `name`, `unit`, `granularity`,
`maxInclusiveDays: 30` y `supportsFilters: false`.

`POST /external-data/query`, Content-Type `application/json`:

```json
{"provider":"xm","dataset":"Gene","startDate":"2024-04-01","endDate":"2024-04-01"}
```

Se aceptan exclusivamente esas claves y `filters` opcional, que debe ser `{}`.
Las métricas iniciales no admiten filtros en XM. Fechas de calendario válidas,
formato exacto YYYY-MM-DD, orden ascendente y entre 1 y 30 días inclusivos.
No se aceptan URLs, entidades o rutas del cliente.

Respuesta 200: `{ provider, dataset, startDate, endDate, unit, granularity,
records: [{ date, hour, value }] }`. `hour` conserva el periodo XM 1..24 o es
`null` para datos diarios; no se deduce un timestamp UTC. `value` es un número
finito, convertido de la representación decimal de XM, sin convertir unidades
ni sumar horas. Se ordena por fecha/hora. No se devuelve el payload crudo.

Una colección `Items: []` produce `records: []`. No se rellenan fechas ausentes
ni se certifica completitud del rango. Fechas fuera del rango, repetidas,
entidades inesperadas, horas faltantes y valores no numéricos producen error
seguro; nunca se convierten faltantes en cero. La conversión a number utiliza
precisión IEEE-754, no aritmética financiera exacta.

Todos los errores públicos son `{ error, message }` con mensajes locales
controlados, sin mensaje original de XM, stack, URL de conexión ni secretos:

| HTTP | Códigos |
| --- | --- |
| 400 | INVALID_EXTERNAL_QUERY, UNSUPPORTED_PROVIDER, UNSUPPORTED_EXTERNAL_DATASET, INVALID_EXTERNAL_DATES, INVALID_EXTERNAL_DATE_RANGE, UNSUPPORTED_EXTERNAL_FILTERS |
| 413 | EXTERNAL_QUERY_TOO_LARGE |
| 415 | UNSUPPORTED_MEDIA_TYPE |
| 502 | EXTERNAL_HTTP_ERROR, EXTERNAL_NETWORK_ERROR, EXTERNAL_RESPONSE_INVALID |
| 504 | EXTERNAL_TIMEOUT |
| 500 | EXTERNAL_CONFIGURATION_ERROR, EXTERNAL_QUERY_FAILED |

## Verificación oficial realizada

Fuentes consultadas el 2026-09-11:

- [FAQ oficial SINERGOX](https://sinergox.xm.com.co/Paginas/PreguntasFrecuentes.aspx),
  que remite al repositorio de herramientas de XM.
- [Documentación oficial API_XM](https://github.com/EquipoAnaliticaXM/API_XM),
  apartados de restricciones SINERGOX, endpoints y variables.
- [Cliente oficial pydataxm](https://github.com/EquipoAnaliticaXM/API_XM/blob/master/pydataxm/pydataxm.py),
  construcción de solicitudes y colecciones de respuesta.
- Consulta HTTP real al catálogo oficial:
  `POST https://servapibi.xm.com.co/Lists`, cuerpo `{"MetricId":"ListadoMetricas"}`.

Selección verificada en el catálogo (siempre `Entity: Sistema`, `Filter: No aplica`):

| ID exacto | Nombre en catálogo | Unidad | Endpoint / colección |
| --- | --- | --- | --- |
| Gene | Generación por Sistema | kWh | /hourly / HourlyEntities |
| DemaSIN | Demanda Energia SIN por Sistema | kWh | /daily / DailyEntities |
| PrecBolsNaci | Precio Bolsa Nacional por Sistema | COP/kWh | /hourly / HourlyEntities |

`DemaSIN` es la demanda del SIN solicitada; no se sustituye por demanda comercial
(`DemaCome`) ni por otra definición de demanda. La consulta saliente contiene
`MetricId`, `Entity`, `StartDate`, `EndDate` y `Filter: []`.

La documentación oficial distingue dos APIs: SIMEM admite hasta 31 días para
datos horarios/diarios; SINERGOX-XM admite hasta 30 días por llamado. Esta
implementación utiliza SINERGOX-XM y mantiene el límite de 30 días inclusivos.
El valor `MaxDays: 31` observado en el catálogo no se utiliza para configurar
este límite ni deja pendiente su elección. No quedan IDs, entidades, unidades
o campos de estas tres métricas por confirmar. Otros datasets quedan fuera
del catálogo.

## Evidencia técnica y límites

Pruebas automatizadas en `../tests/external-data.test.ts`: HTTP Express local y
transporte XM sustituido. Los fixtures son sintéticos con estructura verificada;
no requieren Internet ni PostgreSQL. Casos EXT-01..EXT-18 cubren catálogo,
validación, límites, normalización, HTTP upstream, red, abort durante llamada y
cuerpo, payload malformado y errores internos seguros.

Verificación ejecutada en este incremento (Bun 1.3.13):

- `bun test`: 120 aprobadas, 0 fallidas, 430 aserciones en dos archivos;
  incluye las 66 pruebas previas y 54 casos de la nueva integración.
- `bun --bun run tsc --noEmit --incremental false -p tsconfig.json`:
  correcto, código de salida 0.
- `git diff --check`: correcto; Git advierte únicamente la futura conversión
  LF a CRLF conforme a la configuración local.

Además se ejecutó una lectura real con el servicio y adaptador implementados,
sin guardar datos, para 2024-04-01 (inicio y fin iguales):

| Dataset | Registros | Primer valor normalizado | Periodo |
| --- | ---: | ---: | --- |
| Gene | 24 | 8305353.94 kWh | hora 1 |
| DemaSIN | 1 | 225816448.51 kWh | diario, hour=null |
| PrecBolsNaci | 24 | 768.17121 COP/kWh | hora 1 |

Resultado observado en consola; no se adjuntan capturas ni logs inexistentes.
La comprobación real fue de un día y no verifica disponibilidad histórica
completa, continuidad futura, carga o SLA. No se afirma validación académica.
Un primer intento del script `bun -e` falló por escape de comillas de PowerShell;
se repitió correctamente con entrada estándar (`bun run -`).

El incremento queda implementado y probado técnicamente dentro de este alcance.
La incorporación a EnergyDataset, UI y validación formal permanecen pendientes.
No se modifican CORS ni la documentación académica principal.

### Verificación posterior de endpoints HTTP contra XM real

Ejecutada el 2026-09-11 con `src/app.ts` completo, cargando la configuración
backend y abriendo un listener temporal en `http://127.0.0.1:57852`.
El listener se cerró al finalizar. No se sustituyó el transporte ni se invocaron
rutas de persistencia. Solo se realizaron tres consultas externas de un día:
2024-04-01 a 2024-04-01.

| Caso HTTP | Resultado observado |
| --- | --- |
| GET /external-data/providers | 200; único proveedor `xm`; Gene, DemaSIN y PrecBolsNaci; máximo 30 días |
| POST /external-data/query, Gene | 200; 24 registros; primer valor 8305353.94 kWh, hora 1 |
| POST /external-data/query, DemaSIN | 200; 1 registro; valor 225816448.51 kWh, hour=null |
| POST /external-data/query, PrecBolsNaci | 200; 24 registros; primer valor 768.17121 COP/kWh, hora 1 |
| provider=no-existe | 400 UNSUPPORTED_PROVIDER |
| dataset=no-existe | 400 UNSUPPORTED_EXTERNAL_DATASET |
| startDate=2024-02-30 | 400 INVALID_EXTERNAL_DATES |
| inicio 2024-04-01, fin 2024-03-31 | 400 INVALID_EXTERNAL_DATE_RANGE |
| inicio 2024-04-01, fin 2024-05-01 (31 días inclusivos) | 400 INVALID_EXTERNAL_DATE_RANGE |
| body=[] | 400 INVALID_EXTERNAL_QUERY |
| JSON incompleto: `{` | 400 INVALID_EXTERNAL_QUERY |

Las respuestas exitosas tuvieron Content-Type `application/json; charset=utf-8`,
provider `xm`, dataset correcto y registros `{date, hour, value}` con valores
numéricos finitos. Se comprobó el conjunto exacto de claves del contrato público:
no incluye `Metric`, `Items`, `HourlyEntities` ni `DailyEntities`. El conteo se
calculó como `records.length`; **no existe un campo público `recordCount`**.
Los errores devolvieron únicamente `{error, message}`. El catálogo no incluyó
IDEAM, NOAA, SUI ni CPC. Las entradas inválidas se rechazan antes del adaptador.

A diferencia de la comprobación previa del adaptador, esta ejecución recorrió
HTTP → app Express → router/parser → servicio → adaptador → XM real → respuesta
HTTP normalizada. Los conteos y primeros valores coincidieron con la prueba
directa. No constituye una prueba desde navegador ni de integración frontend.

Se repitieron `bun test` (120 aprobadas, 0 fallidas, 430 aserciones), typecheck
backend y `git diff --check`, todos correctos. Evidencia observada en consola y
resumida aquí; no se guardaron capturas ni archivos de respuestas crudas.
