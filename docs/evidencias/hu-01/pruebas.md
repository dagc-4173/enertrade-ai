# Evidencia de pruebas — HU-01

## Procedencia y alcance

Resultados de ejecuciones anteriores verificadas; no se ejecutaron nuevamente al elaborar este documento. La suite usa HTTP real sobre loopback y sustituye el módulo Prisma antes de importar la aplicación. HU01-INT-01 se ejecutó por separado con Prisma y PostgreSQL reales.

Evidencia automatizada: [dataset.test.ts](../../../backend/src/tests/dataset.test.ts) y salida de `bun test` conservada en la sesión: 11 aprobadas, 0 fallidas, 72 aserciones. Los resultados siguientes son una transcripción técnica de esa evidencia, no logs crudos adjuntos.

## HU01-01 — Dataset válido

- **ID:** HU01-01.
- **HU asociada:** HU-01.
- **Precondición:** aplicación Express local, configuración de desarrollo disponible y Prisma sustituido; doble reiniciado antes de cada prueba.
- **Pasos:** Enviar JSON válido a POST /datasets y revisar respuesta y llamadas al doble Prisma.
- **Resultado esperado:** HTTP 201, recibido, recordCount 1, sin content en respuesta y una llamada de creación.
- **Resultado obtenido:** HTTP 201 y todas las aserciones satisfechas.
- **Estado:** Probado.
- **Evidencia:** caso HU01-01 en [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada de `bun test` en la sesión.

## HU01-02 — Opcionales vacíos

- **ID:** HU01-02.
- **HU asociada:** HU-01.
- **Precondición:** aplicación Express local, configuración de desarrollo disponible y Prisma sustituido; doble reiniciado antes de cada prueba.
- **Pasos:** Enviar registros con zona ausente, null, cadena vacía y espacios; incluir valores obligatorios null, vacíos o semánticamente incorrectos.
- **Resultado esperado:** HTTP 201, un pendiente por zona vacía y contenido conservado.
- **Resultado obtenido:** Pendientes por índice correctos y registros conservados en los argumentos de creación.
- **Estado:** Probado.
- **Evidencia:** caso HU01-02 en [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada de `bun test` en la sesión.

## HU01-03 — Cero y false

- **ID:** HU01-03.
- **HU asociada:** HU-01.
- **Precondición:** aplicación Express local, configuración de desarrollo disponible y Prisma sustituido; doble reiniciado antes de cada prueba.
- **Pasos:** Enviar opcionales con 0 y false.
- **Resultado esperado:** HTTP 201 y lista de pendientes vacía.
- **Resultado obtenido:** HTTP 201 y lista vacía.
- **Estado:** Probado.
- **Evidencia:** caso HU01-03 en [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada de `bun test` en la sesión.

## HU01-04 — Formato inválido

- **ID:** HU01-04.
- **HU asociada:** HU-01.
- **Precondición:** aplicación Express local, configuración de desarrollo disponible y Prisma sustituido; doble reiniciado antes de cada prueba.
- **Pasos:** Enviar cuerpos y registros inválidos, arrays vacíos, columnas inválidas, celdas anidadas, propiedad no declarada y JSON mal formado.
- **Resultado esperado:** Errores controlados de formato y ninguna llamada de creación.
- **Resultado obtenido:** HTTP 400 en los casos estructurales; INVALID_DATASET_FORMAT también para JSON mal formado; ninguna llamada de creación.
- **Estado:** Probado.
- **Evidencia:** caso HU01-04 en [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada de `bun test` en la sesión.

## HU01-05 — Tipo de contenido

- **ID:** HU01-05.
- **HU asociada:** HU-01.
- **Precondición:** aplicación Express local, configuración de desarrollo disponible y Prisma sustituido; doble reiniciado antes de cada prueba.
- **Pasos:** Enviar Content-Type incorrecto, omitido en la construcción de fetch o charset no admitido.
- **Resultado esperado:** HTTP 415, UNSUPPORTED_MEDIA_TYPE y ninguna llamada de creación.
- **Resultado obtenido:** Todos los casos devolvieron 415 sin persistencia. Al omitir el encabezado explícito, fetch puede asignar text/plain para un cuerpo string; no acredita por separado ausencia del encabezado en la red.
- **Estado:** Probado.
- **Evidencia:** caso HU01-05 en [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada de `bun test` en la sesión.

## HU01-06 — Campos y catálogo

- **ID:** HU01-06.
- **HU asociada:** HU-01.
- **Precondición:** aplicación Express local, configuración de desarrollo disponible y Prisma sustituido; doble reiniciado antes de cada prueba.
- **Pasos:** Omitir campos principales; enviar source inválido, tipo desconocido, columnas duplicadas o columna obligatoria ausente.
- **Resultado esperado:** Error controlado apropiado y ninguna llamada de creación.
- **Resultado obtenido:** Códigos MISSING_REQUIRED_FIELD, UNSUPPORTED_DATA_TYPE e INVALID_DATASET_FORMAT según caso; source inválido produjo 400; sin llamadas de creación.
- **Estado:** Probado.
- **Evidencia:** caso HU01-06 en [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada de `bun test` en la sesión.

## HU01-07 — Fallo Prisma

- **ID:** HU01-07.
- **HU asociada:** HU-01.
- **Precondición:** aplicación Express local, configuración de desarrollo disponible y Prisma sustituido; doble reiniciado antes de cada prueba.
- **Pasos:** Configurar el doble para rechazar la creación con detalles sensibles ficticios.
- **Resultado esperado:** HTTP 500 y mensaje genérico, sin detalles internos.
- **Resultado obtenido:** Respuesta exacta DATASET_REGISTRATION_FAILED y mensaje genérico.
- **Estado:** Probado.
- **Evidencia:** caso HU01-07 en [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada de `bun test` en la sesión.

## HU01-08 — Contenido y defaults

- **ID:** HU01-08.
- **HU asociada:** HU-01.
- **Precondición:** aplicación Express local, configuración de desarrollo disponible y Prisma sustituido; doble reiniciado antes de cada prueba.
- **Pasos:** Enviar contenido y valores cliente de uploadedAt/status; inspeccionar argumentos de Prisma y respuesta del doble.
- **Resultado esperado:** Contenido íntegro; uploadedAt/status omitidos de creación; respuesta con valores retornados por persistencia.
- **Resultado obtenido:** Argumentos correctos y valores del doble retornados. Esta prueba aislada no demuestra generación real de defaults.
- **Estado:** Probado.
- **Evidencia:** caso HU01-08 en [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada de `bun test` en la sesión.

## HU01-09 — Catálogo y charset

- **ID:** HU01-09.
- **HU asociada:** HU-01.
- **Precondición:** aplicación Express local, configuración de desarrollo disponible y Prisma sustituido; doble reiniciado antes de cada prueba.
- **Pasos:** Enviar los seis tipos usando application/json; charset=utf-8.
- **Resultado esperado:** HTTP 201 para cada tipo.
- **Resultado obtenido:** Los seis casos devolvieron 201.
- **Estado:** Probado.
- **Evidencia:** caso HU01-09 en [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada de `bun test` en la sesión.

## HU01-10 — Solicitud mayor a 100 KiB

- **ID:** HU01-10.
- **HU asociada:** HU-01.
- **Precondición:** aplicación Express local, configuración de desarrollo disponible y Prisma sustituido; doble reiniciado antes de cada prueba.
- **Pasos:** Enviar una celda string con 110 × 1024 caracteres ASCII mediante HTTP.
- **Resultado esperado:** HTTP 201, sin rechazo por límite de 100 KiB.
- **Resultado obtenido:** HTTP 201. Demuestra aceptación de ese tamaño con Prisma sustituido, no capacidad ilimitada ni persistencia real de grandes volúmenes.
- **Estado:** Probado.
- **Evidencia:** caso HU01-10 en [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada de `bun test` en la sesión.

## HU01-11 — Regresión de auth

- **ID:** HU01-11.
- **HU asociada:** HU-01.
- **Precondición:** aplicación Express local, configuración de desarrollo disponible y Prisma sustituido; doble reiniciado antes de cada prueba.
- **Pasos:** Enviar objeto vacío a POST /auth/register.
- **Resultado esperado:** HTTP 400 con All fields are required antes de llamar al SDK.
- **Resultado obtenido:** Respuesta esperada y ninguna llamada de creación de datasets; no se realizó llamada real al SDK.
- **Estado:** Probado.
- **Evidencia:** caso HU01-11 en [dataset.test.ts](../../../backend/src/tests/dataset.test.ts), salida individual aprobada de `bun test` en la sesión.

## HU01-INT-01 — Integración real PostgreSQL

- **ID:** HU01-INT-01.
- **HU asociada:** HU-01.
- **Precondición:** migración inicial aplicada, Prisma generado y configuración de desarrollo existente. La consulta previa encontró 0 registros con source TGII-HU01-INTEGRATION-TEST.
- **Pasos:** iniciar la aplicación existente con Bun en un puerto temporal de loopback; enviar POST /datasets con application/json; consultar por id y source mediante Prisma real; comparar respuesta y fila; eliminar exclusivamente por ambos identificadores y verificar ausencia.
- **Resultado esperado:** HTTP 201, una fila con contenido y pendientes íntegros, defaults generados, respuesta coincidente y limpieza exclusiva.
- **Resultado obtenido:** HTTP 201; id 1 en esta ejecución; status recibido; recordCount 1; zona pendiente; exactamente una fila consultada; comparación completa satisfactoria; limpieza de una fila y 0 coincidencias posteriores.
- **Estado:** Probado.
- **Evidencia:** solicitud, respuesta, consulta y aserciones emitidas por el script en memoria en la sesión; transcripción siguiente. El script no se guardó como archivo ni se incorporó a bun test.

### Solicitud

```json
{
  "source": "TGII-HU01-INTEGRATION-TEST",
  "dataType": "generacion",
  "columns": [
    { "name": "fecha", "optional": false },
    { "name": "energia_kwh", "optional": false },
    { "name": "zona", "optional": true }
  ],
  "records": [
    {
      "fecha": "2026-09-09T12:00:00Z",
      "energia_kwh": 12.5,
      "zona": null
    }
  ]
}
```

### Respuesta y fila

HTTP 201:

```json
{
  "id": 1,
  "source": "TGII-HU01-INTEGRATION-TEST",
  "dataType": "generacion",
  "uploadedAt": "2026-09-10T00:49:30.468Z",
  "status": "recibido",
  "pendingOptionalFields": [
    { "field": "zona", "reason": "empty_optional_field", "recordIndex": 0 }
  ],
  "recordCount": 1
}
```

**id=1 corresponde únicamente a esa ejecución; no es un identificador fijo del sistema.**

La fila consultada coincidió en id, source, dataType, uploadedAt, status y pendingOptionalFields. Su content fue igual a las columns y records de la solicitud, preservando energia_kwh = 12.5 y zona = null. La comparación ignoró el orden de claves de objetos JSON, sin alterar valores ni el orden de los arrays.

uploadedAt y status no se enviaron en la solicitud ni se incluyeron en los datos de creación del servicio. Se obtuvieron del servidor/base con los defaults previamente verificados. La fecha indicada está en UTC.

### Limpieza y límites de la ejecución

La eliminación utilizó simultáneamente id = 1 y source = TGII-HU01-INTEGRATION-TEST: 1 fila eliminada; consulta posterior por ambos campos: 0 coincidencias. No se eliminaron otros registros ni se reinició la secuencia. La limpieza no es una funcionalidad de HU-01.

El primer intento falló en la lectura previa con conexión rechazada dentro del sandbox. El reintento autorizado completó la integración y limpieza. No se mostraron credenciales.

## Comprobaciones finales de la sesión de integración

| Comando (desde backend) | Resultado obtenido | Estado | Evidencia |
| --- | --- | --- | --- |
| bun test | 11 aprobadas, 0 fallidas, 72 aserciones; código 0 | Probado | Salida de la sesión; HU01-01 a HU01-11 |
| bun --bun run prisma validate | Correcto; código 0 | Probado | Prisma informó esquema válido |
| bun --bun run tsc --noEmit --incremental false -p tsconfig.json | Correcto; código 0, sin emisión | Probado | Salida de la sesión sin errores |
| git diff --check | Correcto; código 0, advertencias LF/CRLF | Probado | Salida de la sesión; no incluye archivos nuevos sin seguimiento |

Estas comprobaciones no sustituyen la validación formal/académica de HU-01, que continúa Pendiente.
