# Cambio de contraseña propia — Evidencia técnica

Fecha local: 21 de octubre de 2026. Estado: implementado y probado técnicamente. Pendientes: aceptación del estudiante y despliegue. Envío de correo sigue pendiente, según decisión expresa previa.

## Cambios

Perfil ofrece contraseña actual, nueva y confirmación. POST /auth/change-password exige sesión activa y contraseña actual; no permite seleccionar otra cuenta. La nueva debe diferir de la actual y tener 12–128 caracteres. El servidor genera Argon2id y actualiza atómicamente contraseña, sesiones y enlaces de recuperación. La sesión actual se renueva sin ampliar el vencimiento; se conserva rol y se cierran las demás sesiones. La interfaz explica esos efectos.

Archivos principales: backend/src/services/change-password.service.ts, backend/src/controllers/change-password.controller.ts, backend/src/app.ts, frontend/src/components/ChangePasswordForm.tsx, frontend/src/services/changePasswordService.ts, frontend/src/pages/Profile.tsx y Profile.css. Decisión: ADR-35. No requiere nueva migración.

## Ejecución observada

- Backend focalizado: 42 pruebas aprobadas, 0 fallos, 118 aserciones, en auth.test.ts, password-recovery.test.ts y change-password.test.ts. Incluye 12 casos nuevos de cambio de contraseña con parametrización.
- PostgreSQL real: 10 pruebas aprobadas, 0 fallos, 51 aserciones, en admin-database.test.ts con ADMIN_DB_TEST=1. Se usó esquema temporal exclusivo; incluye cinco casos administrativos, tres de recuperación y dos nuevos de cambio propio.
- Frontend completo: 256 pruebas aprobadas, 0 fallos, 1131 aserciones, 29 archivos. Log: frontend-tests.txt.
- Tipos backend, compilación de producción frontend, ESLint y revisión de whitespace aprobados.
- No se cambió contraseña de ninguna cuenta real. No se capturaron secretos ni se envió correo para la prueba.

## Casos nuevos

| ID | Precondición y pasos | Esperado | Obtenido |
|---|---|---|---|
| PWD-01 | Sesión activa y contraseña correcta; cambiar | Argon2id, token nuevo y mismo vencimiento | Aprobado |
| PWD-02 | Contraseña actual incorrecta | Rechazo sin escritura | Aprobado |
| PWD-03 | Sesión ausente/vencida o cuenta bloqueada | Rechazo | Aprobado |
| PWD-04 | Sesión/contraseña cambia antes del commit | Conflicto, sin sesión indebida | Aprobado |
| PWD-05 | Campos adicionales, contraseña repetida/corta/inválida | Rechazo | Aprobado |
| PWD-06 | Solicitud HTTP autorizada | Cookie HttpOnly/SameSite y JSON sin token | Aprobado |
| PWD-07 | Sin sesión, origen cruzado e intentos repetidos | 401, 403 y 429 | Aprobado |
| PWD-DB-01 | Sesiones y enlace de recuperación en esquema temporal | Rotar actual, revocar resto/enlace, conservar rol y otras cuentas | Aprobado |
| PWD-DB-02 | Hash obsoleto o bloqueo concurrente | No cambiar contraseña | Aprobado |
| PWD-UI-01..02 | Render y petición frontend | Campos apropiados, JSON sin identidad ajena y cookies | Aprobado |

Relación académica: refinamiento de autenticación y gestión de cuentas solicitado en TG-II. No se inventa número de HU/sprint ni se declara aceptación académica. Conservar estos resultados y el commit manual futuro como evidencia. No se ha realizado commit/push.
