# Incremento de publicaciones horarias para siete días

Fecha de trabajo: 6 de octubre de 2026, America/Bogota. La carpeta de migración usa fecha UTC; no representa una fecha inventada de sprint.

## Estado
Implementado localmente sobre la línea base cd7e0d143215c3359a5cbe01b7ae3b0ca2c02304. Migración aditiva aplicada a la base configurada. Sin publicación en GitHub ni despliegue de producción. Validación académica y recorrido manual de navegador pendientes.

## Alcance
- Mañana hasta hoy + 7 días, con fecha de negocio Bogotá.
- Publicación diaria agrupada y cantidades/precios independientes por hora; horas y días opcionales.
- Formulario de 24 franjas por fecha, copia entre días y envío de los días preparados juntos.
- Tablas propias filtradas por fecha; mercado externo con tabla, selector de pareja diaria y checkboxes.
- Envío atómico de varias horas de un mismo día y pareja de publicaciones; negociaciones independientes con batchId.
- Saldos/reservas por detalle horario, matching de fecha/hora y participantes diferentes, historial y tabla de transacciones.
- Registros históricos conservados sin inventar horas; creación diaria antigua retirada de la aplicación (410).
- Cierre de pendientes al comenzar la entrega, aplicado en consultas; confirmadas inmutables.

No incluye verificación simulada de disponibilidad, pago simulado, entrega física ni liquidación financiera.

## Archivos
Modelo: backend/prisma/schema.prisma y migración 20261007000000_hourly_publications.
API: /publications/window, /publications, /transactions/batch; servicios de mercado, oferta, demanda, transacción, expiración y matching.
Frontend: HourlyPublicationForm, HourlyMarket, Marketplace, Transactions, utilidades, tipos y servicios.
Decisión: docs/adr/ADR-publicaciones-horarias-siete-dias.md.

## Pruebas ejecutadas
138 pruebas backend aprobadas, 0 fallos: 11 archivos de contratos horarios/API, publicaciones, transacciones, matching, saldos, expiración, trazabilidad y versiones.
44 pruebas frontend aprobadas, 0 fallos: marketplace.test.tsx, matching-patterns.test.tsx, hourly-market.test.tsx. Estas pruebas incluyen renderizado estático y contratos, no equivalen a una prueba manual en navegador.
Comprobación TypeScript backend aprobada. Compilación frontend y lint aprobados. git diff --check sin errores de espacios.

## Integración real HTTP + PostgreSQL
Script reproducible: backend/scripts/hourly-integration.ts. Usa dos usuarios y sesiones temporales propios; no imprime credenciales. Limpieza transaccional limitada a registros creados por la ejecución.

| ID | HU | Precondición y pasos | Esperado y obtenido | Estado |
| --- | --- | --- | --- | --- |
| HOUR-INT-01 | HU-21/22 | Consultar ventana sin cookie | HTTP 401 | Aprobada |
| HOUR-INT-02 | HU-21/22 | Publicar oferta y demanda en 7 fechas, 2 horas por día | HTTP 201; 14 cabeceras | Aprobada |
| HOUR-INT-03 | HU-21/22 | Consultar publicaciones propias | Horas 8/9 con cabecera común por fecha | Aprobada |
| HOUR-INT-04 | C21a/HU-20 | Enviar lote con primera hora válida y segunda sin saldo | HTTP 409; cero transacciones persistidas | Aprobada |
| HOUR-INT-05 | C21a/HU-20 | Proponer 6 kWh en cada una de dos horas con saldo 10 | Dos negociaciones; saldo 4 por hora | Aprobada |
| HOUR-INT-06 | C21b/HU-20 | Contraparte acepta primera y rechaza segunda | CONFIRMED y REJECTED | Aprobada |
| HOUR-INT-07 | C21a/HU-20 | Consultar saldos posteriores | Saldo 4 en confirmada y 10 en rechazada | Aprobada |
| HOUR-INT-08 | HU-21/22 | Añadir hora nueva y hora ya publicada en un envío | HTTP 409; hora nueva no persiste | Aprobada |
| HOUR-INT-09 | C21a/HU-20 | Dos lotes simultáneos reservan 8 sobre saldo 10 | Uno 201 y otro 409; sin sobreasignación | Aprobada |

La primera integración falló después de tres casos: el reenvío interno incluía matchingExecutionId nulo y el contrato lo rechazaba. Se corrigió omitiendo el campo opcional y se repitió: nueve casos aprobados; limpieza completada. No se oculta la primera ejecución fallida.

Ejecución final: 10 casos aprobados, 0 fallos; limpieza de fixtures completada. HOUR-INT-10 comprobó que POST /offers y POST /demands autenticados devuelven 410 y remiten al contrato horario. La aplicación ya no permite crear publicaciones nuevas sin hora mediante esos endpoints.

## Trazabilidad académica
Impacto directo: HU-21/22, HU-10/11; incrementos C20f y C21a–C21e. Contratos, manejo de conflictos y pruebas: HU-14/15/20. Versionado y consultas: HU-17/18. No se asignan nuevos números de HU ni story points retrospectivos; incorporar este refinamiento al backlog y al sprint real tras revisión del estudiante.

## Pendientes y límites
- Revisar manualmente selección, copia de días, navegación por teclado y móvil.
- Registrar capturas y validación del estudiante/asesor.
- Los saldos utilizan consultas por detalle; evaluar rendimiento antes de usar muchos usuarios/publicaciones.
- No se ejecutó nuevamente la integración completa de todos los modelos IA; el script HU-20 se ajustó al método y participantes distintos.

## Uso de IA
ChatGPT apoyó análisis, ADR, implementación, pruebas y documentación. La verificación se sustenta en compilación, suites ejecutadas e integración real. El estudiante debe comprender y revisar el incremento antes de presentarlo como validado académicamente.


## Acceso a negociación desde coincidencias
Por solicitud del estudiante se incorporó Ir a negociar en cada asignación horaria que involucra una publicación propia. Preselecciona publicación diaria externa y propia, hora, cantidad y precio sugeridos; desplaza y enfoca el formulario. No crea propuestas ni reservas al seleccionar. Sugerencias desactualizadas, saldo insuficiente, hora/fecha incompatible o publicaciones históricas sin desglose bloquean el acceso con explicación. Coincidencias entre terceros no presentan la acción.

Archivos: MatchingResults.tsx, Marketplace.tsx, HourlyMarket.tsx y matchingNegotiation.ts. No se modificaron contratos backend ni migraciones para este ajuste. Relación: HU-10 y los incrementos transaccionales C21b/C21e.

Pruebas ejecutadas: MATCH-CTA-01 comprueba precarga para comprador/vendedor y renderizado de hora seleccionada; MATCH-CTA-02 rechaza terceros/saldo insuficiente/horas distintas/históricos; MATCH-CTA-03 comprueba botón y bloqueo por desactualización. Resultado de la suite ampliada: 47 pruebas frontend aprobadas, 0 fallos, en 4 archivos. Lint y compilación aprobados. Estas verificaciones son de lógica, contratos y renderizado estático; el recorrido interactivo manual sigue pendiente.

ChatGPT apoyó implementación y pruebas de este ajuste. Conservar esta evidencia para la trazabilidad del informe; validación académica pendiente.


## Revisión interactiva real del acceso desde coincidencias
Fecha de negocio: 6 de octubre de 2026, America/Bogota. Navegador: Edge, aplicación local con sesión existente; backend y PostgreSQL disponibles. Se usaron coincidencias ya presentes, sin crear publicaciones ni enviar propuestas.

| ID | HU/incremento | Precondición y pasos | Esperado | Obtenido | Estado |
| --- | --- | --- | --- | --- | --- |
| MATCH-BROWSER-01 | HU-10/C21e | Solicitar matching y pulsar Ir a negociar en una coincidencia propia | Abrir pareja diaria, seleccionar hora y precargar cantidad/precio | Demanda externa y oferta propia del 07/10/2026; hora 03–04, 12.000 kWh a 980 COP/kWh; total 11.760.000 COP | Aprobada |
| MATCH-BROWSER-02 | C21b | Editar cantidad a 11.500,25 y precio a 975,12345 | Conservar decimales es-CO y recalcular total visible | Entradas conservadas; total presentado 11.214.163 COP con redondeo de visualización | Aprobada |
| MATCH-BROWSER-03 | HU-10/C21e | Activar por Enter otra coincidencia | Reemplazar la selección anterior y enfocar negociación | Hora 02–03 seleccionada, 10.000 kWh a 950 COP/kWh; total 9.500.000 COP; foco en encabezado Mercado por hora | Aprobada |

Captura final: [negociación desde coincidencia](negociacion-desde-coincidencia.png). La captura es evidencia importante para el informe TG-II. Las propuestas quedaron sin enviar y no se modificaron saldos mediante negociación.

Esta revisión cubre apertura, precarga, edición y teclado para el rol vendedor. No acredita el flujo manual del comprador, envío/aceptación desde navegador, comportamiento móvil ni verificación simulada de disponibilidad. Esos escenarios conservan su estado pendiente; la validación académica corresponde al estudiante/asesor.

## Correcciones técnicas posteriores a la auditoría (7 de octubre de 2026)

HEAD permanece cd7e0d1; se conservan los cambios marketplace/transacciones anteriores. Sin commit, migraciones, scripts de integración, PostgreSQL habitual ni ejecución del fixture de navegador. demand.service.ts aquí corresponde a publicaciones del marketplace, no al pronóstico HU-06.

Se corrigieron expiración acotada y configuración fail-closed de integración, comparaciones Prisma.Decimal, snapshot reproducible con claves de participante por ejecución, persistencia de lotes inyectable y ciclo de vida temporal del fixture. El ADR registra las decisiones y el límite del contrato batchId; no se amplían DTOs/UI individuales.

### Casos añadidos y ejecutados

| ID | Relación | Precondición y pasos | Esperado y obtenido | Estado |
| --- | --- | --- | --- | --- |
| EXP-ISOLATED-01/02 | HU-21/22, HU-20 | Almacenamiento simulado con filas fixture, externas y mixtas; ejecutar scope y scope vacío | Solo filas fixture; ningún write con scope vacío | Aprobada con mocks |
| EXP-ISOLATED-03 | HU-20 | Configuración ausente, misma base por nombre, alias/credenciales, URL inválida y redirección; configuración separada válida | Rechazo seguro o selección explícita; no conexión | Aprobada, pura |
| EXP-ISOLATED-04 | HU-21/22, HU-10/20 | Consultar ofertas/demandas, mercado y matching con efecto inyectado | Todos los writes conservan alcance; ningún efecto global | Aprobada con mocks |
| DECIMAL, 16 casos | HU-21/22, C21a | Prisma.Decimal grande y centésimas; propuesta menor, igual o mayor al compromiso; cambiar compromiso entre prelectura y bloqueo | Detectar 0.01, igualdad, saldo exacto y rechazo antes de escribir | Aprobada, memoria/controlador/base simulada |
| TRACE-MATCH-SELF | HU-10/11 | Guardar traza con oferta propia/externa; reconstruir matching desde snapshot | Igual resultado y exclusión propia; sin UUID de usuario | Aprobada con mocks |
| BATCH-MEMORY-01/02/03 | C21, HU-20 | Repositorio en memoria; éxito, fallo de segunda franja y frontera ausente; bloquear Prisma global | Hour/batchId correctos; rollback de transacciones/revisiones; sin fallback | Aprobada en memoria |
| BATCH-ISOLATED-01, PAY-ISOLATED | C21, HU-20 | Excluir un participante del alcance; intentar crear/cancelar/pagar/resolver | 404, registros y reservas externos intactos | Aprobada en memoria |
| BROWSER-LIFECYCLE-01 a 05 | HU-20 | Base y archivos simulados; fallo parcial, de escritura, servidor, BD y retiro temporal | Finally limitado a fixtures; reintentos; error visible ante fallo permanente | Aprobada con mocks; sin arrancar fixture |

### Comandos y resultados

Backend, cwd backend, Bun 1.3.13. DATABASE_URL del proceso unitario apunta a 127.0.0.1:1 con credenciales ficticias, nunca a la configuración habitual.

```text
bun test src/tests/publication-expiration.test.ts src/tests/market-balance.test.ts src/tests/energy-marketplace.test.ts src/tests/hourly-publication.test.ts src/tests/hourly-publication.controller.test.ts src/tests/publication-verification.test.ts src/tests/matching-trace.test.ts src/tests/energy-transaction.test.ts src/tests/energy-transaction.controller.test.ts src/tests/simulated-payment.test.ts src/tests/ai-query-trace.test.ts src/tests/capability-versions.test.ts src/tests/browser-flow-fixture.test.ts
bun run typecheck
```

Resultado: 158 pruebas aprobadas en 13 archivos, cero fallos; typecheck aprobado. Después se añadió el quinto caso de retiro temporal y se cerró rechazo de redirección URL: bun test src/tests/publication-expiration.test.ts src/tests/browser-flow-fixture.test.ts, 13 aprobadas, cero fallos; typecheck aprobado. No sumar ejecuciones repetidas como casos nuevos.

Frontend, cwd frontend, sin backend real:

```text
bun test tests/marketplace.test.tsx tests/hourly-market.test.tsx tests/matching-negotiation.test.tsx tests/publication-verification.test.tsx tests/simulated-payment.test.tsx
npm run build
npm run lint
```

Resultado: 49 pruebas aprobadas en cinco archivos, cero fallos; build TypeScript/Vite y lint aprobados. No se modificó código frontend para ampliar batchId.

Incidencias conservadas: la primera prueba de comparación bloqueada usó spyOn sobre delegados Prisma y no interceptó el proxy: 43 aprobadas, dos fallos al intentar conectar al puerto cerrado 127.0.0.1:1. No hubo conexión ni escritura PostgreSQL. Se reemplazó por fábricas de repositorio con base explícita simulada y se repitió: 45 aprobadas. El typecheck detectó además una firma oferta reutilizada en un mock demanda; se corrigió y se repitieron las mismas 45 pruebas y typecheck, ambos aprobados.

Conservar estos casos, comandos, salidas de terminal y cambios como evidencia TG-II. Las integraciones PostgreSQL de las secciones anteriores son evidencia histórica, no reejecuciones de este árbol corregido. Quedan pendientes aplicación de migraciones/constraints en base desechable, concurrencia real y recorrido de navegador, todos sujetos a nueva autorización. No se declara validación académica ni HU completada.
