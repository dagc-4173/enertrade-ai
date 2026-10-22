# Recuperación de contraseña — Evidencia técnica

Ejecución local: 21 de octubre de 2026, zona America/Bogota. Estado: implementado y probado técnicamente; envío real pendiente por decisión expresa del estudiante. No se ha enviado correo real ni modificado la contraseña de una cuenta real para probar.

## Implementación verificada

- Solicitud desde ¿Olvidaste tu contraseña? y formulario de contraseña nueva con confirmación.
- Tokens aleatorios de 256 bits, SHA256 persistido, vigencia de 30 minutos y uso único. Nueva solicitud invalida la anterior.
- Consumo transaccional, cierre de sesiones y protección frente a consumos simultáneos. No modifica rol ni desbloquea cuentas.
- Invalidación de tokens por cambios administrativos. Inicio de sesión revalida contraseña/estado al crear sesión para impedir carreras con restablecimiento/bloqueo.
- Respuesta genérica antes de buscar cuenta o enviar correo, límites IP/correo/concurrencia y protección de origen. Sin SMTP se devuelve 503; no se presenta un envío como exitoso.
- SMTP con TLS implementado mediante Nodemailer. Configuración de proveedor y entrega al buzón no probadas ni completadas. El estudiante decidió posponer el envío porque no tiene dominio ni remitente configurado.

## Pruebas y resultados

- Regresión backend: 368 pruebas aprobadas en 16 archivos ejecutados por separado; 0 fallos. 18 pertenecen a recuperación (REC-01..13 con casos parametrizados). `backend-resumen.txt` conserva el detalle.
- PostgreSQL real: 8 pruebas aprobadas, 0 fallos, 41 aserciones, en esquema temporal exclusivo con 21 migraciones aplicadas. Incluye 5 casos administrativos y 3 de recuperación (REC-DB-01..03). `postgresql.txt`.
- Backend total seleccionado: 376 pruebas aprobadas. No representa toda la batería ML.
- Frontend completo: 254 pruebas aprobadas, 0 fallos, 1119 aserciones, 28 archivos. `frontend-tests.txt`.
- Compilación de producción frontend, ESLint, tipos backend y revisión de whitespace aprobadas. Logs adjuntos.
- Migración `20261021000200_password_recovery` aplicada en el entorno configurado; backend local reiniciado.
- Verificación visual con un token ficticio: formulario de nueva contraseña y confirmación; token retirado de la URL. No se introdujeron contraseñas ni se envió ese formulario. Captura sin credenciales en `formulario.png`.

## Casos

| ID | Precondición y pasos | Resultado esperado | Obtenido | Evidencia |
|---|---|---|---|---|
| REC-01 | Emitir enlace con transporte de correo sustituido | Solo hash almacenado, 256 bits, 30 minutos | Aprobado | backend-password-recovery.txt |
| REC-02/03 | Cuenta ausente/bloqueada o fallo SMTP | Sin correo para cuenta inhabilitada; revocar token al fallar envío | Aprobado | backend-password-recovery.txt |
| REC-04/05 | Restablecer y rechazar enlace inválido/usado/vencido | Argon2id y error genérico | Aprobado | backend-password-recovery.txt |
| REC-06/07 | Búsqueda/envío pendientes o SMTP sin configurar | Respuesta independiente de cuenta; 503 si no existe proveedor | Aprobado | backend-password-recovery.txt |
| REC-08/09/11/12/13 | Repetición por IP/correo, origen cruzado, entradas inválidas y concurrencia | Rechazo o limitación sin escritura indebida | Aprobado | backend-password-recovery.txt |
| REC-10 | SMTP sin TLS/configuración confiable | Rechazo de configuración | Aprobado | backend-password-recovery.txt |
| REC-DB-01 | Consumir mismo token en paralelo sobre esquema temporal | Un éxito, sesiones revocadas y rol preservado | Aprobado | postgresql.txt |
| REC-DB-02 | Reemitir, vencer y bloquear cuenta | Tokens anteriores y bloqueados no cambian contraseña | Aprobado | postgresql.txt |
| REC-DB-03 | Contraseña verificada antes de una actualización | No crear sesión con contraseña anterior | Aprobado | postgresql.txt |
| REC-UI-01..04 | Formularios y solicitudes de frontend | Confirmación, token no visible y POST seguro | Aprobado | frontend-tests.txt |

Relación académica: ampliación de autenticación/gestión de cuentas solicitada en TG-II. Debe refinarse en backlog y asignarse a sprint sin inventar fechas ni puntos. ADR-34 conserva alternativas y consecuencias; la guía de operación describe lo pendiente para correo. No se declaran HU, validación académica ni despliegue completos.

## Límites y continuidad

El envío usa una cola acotada en memoria; reiniciar puede interrumpir una entrega aceptada. Los límites son por instancia, requieren almacenamiento compartido antes de varias réplicas. Enlaces localhost requieren el mismo equipo; despliegue necesita frontend accesible y HTTPS. Credenciales SMTP deben permanecer fuera de Git. No hay prueba de entrega real ni cambio real de contraseña: el estudiante completará esa aceptación cuando configure el remitente. No se ha hecho commit/push.

Conservar evidencia junto al commit manual futuro. Uso de IA: ChatGPT/Codex apoyó diseño, código, pruebas y documentación; revisión y comprensión final corresponden al estudiante.
