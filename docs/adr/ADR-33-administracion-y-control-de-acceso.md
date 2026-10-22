# ADR-33 — Administración y control de acceso

Estado: implementado y probado técnicamente en entorno local; pendiente validación académica y despliegue.

## Contexto y trazabilidad

El estudiante autorizó incorporar administración antes del cierre de TG-II. La autenticación previa no distinguía roles; indicadores e histórico global de patrones no estaban reservados al administrador. El cambio contribuye a los controles de HU13 y HU19; no declara completadas esas HU ni modifica los objetivos heredados de TG-I. La gestión de cuentas es una ampliación solicitada en TG-II, que debe incorporarse al refinamiento del backlog sin inventar número de sprint, fechas de ejecución académica o story points aprobados.

## Alternativas

1. Jerarquía superadministrador/administrador/usuario y permisos individuales: mayor coste y estados difíciles de validar para el alcance actual.
2. Roles Usuario/Administrador, controles en servidor y registro de cambios: satisface la necesidad actual conservando la arquitectura.
3. Ocultar controles solo en frontend: insuficiente, permite invocar directamente los endpoints.

## Decisión

Se adopta la alternativa 2 mediante campos aditivos con valores iniciales USER/ACTIVE. El registro público no acepta roles ni estados. La sesión consulta el rol y estado actuales de la cuenta. Administrador conserva las pantallas normales y añade Usuarios, Auditoría y Datasets.

Las modificaciones permitidas son rol y estado, con motivo obligatorio. No hay eliminación física, suplantación, edición de contraseñas ajenas ni acciones comerciales en nombre de terceros. La última cuenta administradora activa se protege con conteo posterior a un bloqueo transaccional compartido de PostgreSQL; los cambios propios se rechazan y deben gestionarse desde otra cuenta administradora. Los cambios revocan las sesiones del destinatario.

Bloquear una cuenta cancela sus negociaciones pendientes y sus publicaciones activas dentro de la misma transacción que actualiza el acceso y registra auditoría. Los acuerdos confirmados se conservan. Desbloquear no restaura las publicaciones ni negociaciones canceladas. La publicación horaria comprueba el estado bajo bloqueo de la fila de usuario para coordinarse con el bloqueo administrativo.

La auditoría registra responsable, destinatario, motivo, antes/después y efectos sobre sesiones/publicaciones/negociaciones. Un fallo de auditoría revierte toda la operación. La primera cuenta administradora se activa mediante comando local, únicamente cuando no existe administrador activo, después de su registro normal. No se crea endpoint público de bootstrap.

Las rutas de datasets, importación externa, sincronización manual XM, indicadores, catálogo técnico de versiones e histórico global de patrones requieren administrador. El análisis descriptivo de patrones y los pronósticos siguen disponibles para usuarios autenticados según sus contratos existentes. Se reutiliza el registro/validación/preparación de datasets y la sincronización XM; no se añade entrenamiento automático ni generación sintética.

## Consecuencias y límites

- Aplicar la migración antes de reiniciar el backend con este código. Todas las cuentas existentes conservan sus datos e inician como USER/ACTIVE.
- Los clientes de rutas que ahora requieren permisos deben enviar cookies de sesión; los scripts automatizados sin sesión necesitan adaptación explícita, no una excepción pública.
- La vista de una sesión revocada se actualiza al recuperar foco o en la comprobación periódica de 60 segundos; cada solicitud protegida valida la sesión en servidor.
- No se añade recuperación de contraseña, MFA, correo de invitación, autorización por campo, verificación institucional del correo ni consola global de transacciones.
- Falta validación de aceptación por el estudiante y evaluación en un entorno desplegado. Las pruebas técnicas no acreditan validación académica.

## Evidencias

Pruebas de permisos: `backend/src/tests/admin-access.test.ts`. Pruebas reales optativas, en esquema temporal separado: `backend/src/tests/admin-database.test.ts`. Frontend: `frontend/tests/admin.test.tsx`. La prueba de base de datos aplica todas las migraciones en un esquema exclusivo y lo elimina al finalizar; no crea cuentas de prueba en el esquema de uso normal.

Uso significativo de IA generativa: apoyo de ChatGPT/Codex en diseño, implementación, pruebas y documentación. El estudiante debe revisar y sustentar las decisiones y resultados antes de incorporarlos al informe.
