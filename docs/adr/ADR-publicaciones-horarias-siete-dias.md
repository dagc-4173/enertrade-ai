# Publicaciones horarias en una ventana de siete días

Estado: decisión aceptada por el estudiante; implementada localmente. Pruebas automatizadas e integración PostgreSQL ejecutadas. Validación académica y revisión manual en navegador pendientes.

## Contexto
EnerTrade AI continúa TG-I. Las publicaciones actuales almacenan una cantidad y fecha de entrega sin horas. El estudiante autorizó una ventana de los próximos siete días con negociación independiente por hora.

## Alternativas
1. Publicar únicamente para mañana: menor alcance de interfaz, misma necesidad de incorporar detalle horario.
2. Publicar para mañana hasta hoy + 7 días: planificación flexible con ventana acotada. Alternativa elegida.
3. Fechas ilimitadas: complejidad de planificación innecesaria para el prototipo.

## Decisión
Utilizar fecha de negocio America/Bogota. Una publicación diaria contiene detalles horarios 0–23; cada hora representa el intervalo [hora, hora + 1). No es obligatorio completar todas las horas ni todos los días. Cada detalle conserva cantidades y saldos independientes. Se permite seleccionar varias horas de un mismo día; cada negociación mantiene historial independiente. La selección no reserva energía hasta que el backend registra la propuesta.

Conservar los registros históricos sin asignarles horas inventadas. Separar explícitamente publicaciones históricas sin desglose del nuevo mercado horario. Las cantidades y precios negociados de compromisos existentes deben conservarse. La operación continúa siendo simulada.

## Consecuencias
Adaptar Prisma, migraciones, validación de entrada, reservas, vencimiento, matching versionado, snapshots, contratos API, formularios y tablas. Definir y probar atomicidad de creación múltiple y orden de bloqueo. Evitar cambios en fecha/hora de detalles con compromisos.

La fecha de negocio avanza, pero la ventana no modifica compromisos confirmados. Al llegar la fecha de entrega se cierra la creación de nuevas negociaciones para esas publicaciones; deben resolverse las reservas pendientes conforme a una regla explícita y probada.

## Trazabilidad
Impacto directo: HU-21, HU-22, HU-10, HU-11 e incrementos C20f/C21a–C21e. Impacto de contratos y pruebas: HU-14, HU-15 y HU-20. No renumerar historias ni afirmar criterios completados antes de ejecutar pruebas.

## Alcance posterior
Verificación simulada de disponibilidad y pago simulado se implementarán después de estabilizar las publicaciones y transacciones horarias. No incorporar garantías de energía física ni pagos reales.

## Evidencia y uso de IA
ChatGPT apoyó el análisis de alternativas y la preparación de esta decisión. El código, las pruebas ejecutadas y la revisión del estudiante deben sustentar la implementación. Este ADR no acredita pruebas ni despliegue.

## Implementación concreta
EnergyPublication es la cabecera única por usuario, tipo y fecha. EnergyOffer y EnergyDemand se reutilizan como detalles reservables por hora mediante hour y publicationId, sin duplicar el motor de reservas existente. EnergyTransaction conserva una copia de la hora y batchId para agrupar el envío; las revisiones conservan cantidad y precio. Registros históricos mantienen hour/publicationId nulos.

Los días son opcionales dentro de la ventana fija: no se exige publicar 168 franjas. POST /publications permite añadir horas nuevas a una cabecera existente; una hora repetida rechaza y revierte todo el envío. Los POST diarios heredados devuelven 410 en la aplicación; se conservan GET, PATCH y cancelación para historial y mantenimiento.

Las negociaciones se cierran al comienzo del día de entrega en Bogotá. El cierre se aplica al consultar publicaciones/mercado/matching; además crear, editar, aceptar y contrapropor verifican el cierre. Las pendientes pasan a CANCELLED y liberan reservas; las confirmadas se conservan. No se afirma que exista un proceso programado de cierre independiente de las consultas.

El matching-hourly-v2 exige usuarios distintos e igualdad de fecha/hora. No mezcla históricos sin hora con detalles horarios. Se conservan las trazas anteriores.

## Correcciones de la auditoría técnica (7 de octubre de 2026)

La aplicación productiva conserva la expiración global. createApp admite un alcance explícito de usuarios fixture: ofertas, demandas, mercado y matching comparten la misma expiración acotada. Un alcance vacío no escribe. La cancelación exige ambos participantes y ambos propietarios de las publicaciones dentro del alcance; negociación y pagos aislados rechazan referencias externas. Los usuarios fixture son UUID recién creados por cada ejecución, no usuarios preexistentes.

Los cinco scripts requieren ENERTRADE_INTEGRATION_DATABASE_URL y ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE=true antes de importar Prisma. El nombre de base debe ser diferente del habitual, incluso si cambia el host o las credenciales; se rechazan parámetros de redirección. Esta configuración no sustituye la verificación operativa de que el servidor y los permisos corresponden a una base desechable. No se ejecutaron scripts ni migraciones en esta corrección.

Las cantidades comprometidas/reservadas y las comparaciones bajo bloqueo conservan Prisma.Decimal; el saldo se calcula antes de convertirlo al DTO numérico existente. No se cambian unidades ni escalas SQL. El contrato de entrada y visualización sigue usando números: no puede recuperar precisión perdida antes de llegar al backend.

El snapshot de matching incorpora participantKey compartida entre ofertas/demandas del mismo participante, pero válida solo dentro de la ejecución. La igualdad de claves reconstruye la exclusión de autointercambio, sin guardar UUID de usuario, email o nombre. criteriaSnapshot describe esta representación. No se reescriben trazas históricas; un snapshot anterior sin identidad suficiente no acredita reproducción de esta decisión v2.

createBatch delega la atomicidad a withLockedBatch del repositorio inyectado. Sin esa capacidad falla explícitamente, sin fallback a Prisma global. El repositorio PostgreSQL conserva Serializable y bloqueo ordenado; el de pruebas revierte transacciones, revisiones y reservas al fallar una franja.

batchId sigue persistido como correlación del envío atómico y aparece en el acuse de POST /transactions/batch ya existente. No forma parte del DTO individual, GET de transacciones, filtros ni gestión de UI. Cada hora se acepta, rechaza o paga de forma independiente; no se añade agrupación solo por existir la columna.

El fixture de navegador usa OS temp o ENERTRADE_BROWSER_FIXTURE_DIRECTORY, una subcarpeta exclusiva y credenciales generadas para example.test. No arranca al importarlo. finally limpia los registros vinculados a usuarios recién creados y elimina el archivo temporal, con reintentos limitados y error explícito si falla. SIGINT/SIGTERM disparan cierre; una terminación forzada del proceso o denegación persistente del sistema operativo no puede garantizar cleanup.

Trazabilidad: HU-21/22, HU-10/11, C21 y pruebas HU-20. Evidencia de pruebas con mocks/memoria en docs/evidencias/publicaciones-horarias/README.md. HU-06, schema, migraciones y validación académica no se modifican.
