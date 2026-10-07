# Verificación simulada de publicaciones

Fecha de negocio: 6 de octubre de 2026, America/Bogota. Incremento implementado localmente; validación académica pendiente. La migración aditiva 20261007010000_publication_verification fue aplicada a la base configurada. No se realizó commit ni despliegue de producción.

## Alcance y referencia
Perfil configurable separado para oferta/demanda, con límites explícitos por hora y versiones inmutables. No se asignaron capacidades ficticias a usuarios existentes ni se usaron pronósticos agregados como garantía individual. Se adoptó la opción recomendada de perfil configurable mientras se consultaba la preferencia de origen; un dataset externo requerirá indicar y validar su fuente antes de integrarlo.

Verificación voluntaria e informativa: APPROVED indica cantidad dentro del límite declarado; REJECTED, cantidad superior; NO_REFERENCE, ausencia de perfil/hora/límite; OUTDATED, publicación o perfil cambiados desde la ejecución. En interfaz se distingue Sin verificar de Sin referencia simulada. No modifica cantidades, saldos, reservas, matching ni acuerdos existentes, ni constituye disponibilidad energética física. No bloquea negociación en este incremento.

Guarda usuario, publicación, perfil utilizado, regla declared-hourly-capacity@1.0.0, entrada, resultado, motivo y fecha. Una modificación del perfil crea nueva versión, conserva el historial y marca resultados anteriores como desactualizados. La comparación de cantidades utiliza enteros escalados para evitar pérdida decimal.

## Archivos y rutas
Modelo Prisma: SimulationCapacityProfile y PublicationVerification. Controlador publication-verification.controller.ts, reglas publication-verification.rules.ts y consulta publication-verification.summary.ts; DTO propios de oferta/demanda. Frontend: PublicationVerification.tsx, publicationVerificationService.ts, Marketplace y tipos.

- GET /publication-verifications/profiles/:kind: perfil propio vigente.
- POST /publication-verifications/profiles: nueva versión propia.
- POST /publication-verifications/:kind/:id: verificar una publicación propia y registrar resultado.
- GET /offers/mine y /demands/mine: última verificación con detección de cambios.

## Verificación ejecutada
43 pruebas backend aprobadas en tres archivos (reglas, publicaciones horarias y regresión de marketplace). 51 pruebas frontend aprobadas en cinco archivos (verificación, mercado, negociación desde coincidencias, horarios y matching/patrones). TypeScript backend, lint y compilación frontend aprobados.

Pruebas reales HTTP + PostgreSQL reproducibles con backend/scripts/verification-integration.ts. Dos usuarios temporales, perfiles y publicaciones de prueba; limpieza completada exclusivamente sobre los fixtures de la ejecución.

| ID | HU/incremento | Precondición y pasos | Esperado/obtenido | Estado |
| --- | --- | --- | --- | --- |
| VERIFY-INT-01 | HU-21/22 | Consultar sin sesión | HTTP 401 | Aprobada |
| VERIFY-INT-02 | HU-21 | Publicación sin perfil, solicitar verificación | NO_REFERENCE registrado | Aprobada |
| VERIFY-INT-03 | HU-21/22 | Otro usuario verifica publicación ajena y consulta perfil propio vacío | HTTP 404; perfil null | Aprobada |
| VERIFY-INT-04 | HU-21 | Configurar límite 10.25, verificar publicación 10.25 | Perfil v1; APPROVED | Aprobada |
| VERIFY-INT-05 | HU-21 | Consultar listado propio | Resultado APPROVED, saldo 10.25 intacto | Aprobada |
| VERIFY-INT-06 | HU-21 | Configurar v2 con límite 10.24 y volver a verificar | OUTDATED previo; REJECTED nuevo | Aprobada |
| VERIFY-INT-07 | HU-21/HU-20 | Consultar auditoría y versión original | Tres resultados conservados; v1 intacta | Aprobada |
| VERIFY-INT-08 | HU-21/22 | Intentar enviar userId y consultar otro tipo sin configurar | HTTP 400; perfil demanda null | Aprobada |
| VERIFY-INT-09 | HU-20 | Guardar dos versiones simultáneas | Ambas 201; versiones 3 y 4 sin sobrescritura | Aprobada |

## Navegador real
Edge con sesión existente, aplicación local: se pulsó Verificar en simulación en una oferta horaria sin perfil. Resultado Sin referencia simulada con motivo, regla, fecha y etiqueta informativa. Cantidad disponible 9.000 kWh conservada. No se configuraron límites arbitrarios para el usuario ni se enviaron transacciones. [Captura](verificacion-sin-referencia.png).

La captura y resultados son evidencia importante para TG-II. La revisión manual de aprobación/rechazo con un perfil configurado, demanda y móvil sigue pendiente; aprobación/rechazo y concurrencia sí se comprobaron con fixtures en PostgreSQL.

## Trazabilidad y uso de IA
Refinamiento de HU-21/HU-22 y pruebas de HU-20, sin nueva numeración ni story points retrospectivos. ADR: docs/adr/ADR-verificacion-simulada-publicaciones.md. ChatGPT apoyó análisis, implementación, pruebas, integración, captura y documentación; revisión del estudiante/asesor pendiente. El pago simulado no pertenece a este incremento.
