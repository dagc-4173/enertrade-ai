# ADR-34 — Recuperación de contraseña por correo

Estado: implementación y pruebas técnicas locales realizadas; envío real pendiente por decisión expresa del estudiante. No implica entrega operativa de correo, validación académica ni despliegue.

## Contexto y trazabilidad

El estudiante solicitó recuperar contraseñas mediante correo después de incorporar administración. Amplía autenticación y gestión de cuentas en TG-II. No se renumeran las HU heredadas ni se afirma que un criterio académico previo esté completado sin su revisión. Conservar trazabilidad con ADR-33 y registrar el refinamiento y sprint cuando el estudiante los defina.

## Alternativas y decisión

Se descartó enviar contraseñas por correo, preguntas de seguridad y enlaces permanentes. Se eligió enlace aleatorio de 256 bits, con vigencia de 30 minutos y un solo uso. En la base de datos se guarda únicamente SHA256 del token. La contraseña nueva se guarda con Argon2id, igual que el registro existente. Una solicitud posterior invalida la anterior.

Se reutiliza SMTP mediante Nodemailer, con certificado validado, TLS obligatorio y puertos 465/587. Esta interfaz permite cambiar entre proveedores sin rehacer la recuperación. Brevo con dominio controlado/authenticado fue la primera recomendación para despliegue. Como el estudiante no tiene dominio, se explicó la alternativa de una cuenta Gmail dedicada con verificación en dos pasos y contraseña de aplicación, si está permitida. El estudiante decidió dejar el envío pendiente; no se configuraron credenciales ni se enviaron correos reales.

## Controles

- La respuesta aceptada no confirma si existe el correo o si está bloqueado. La consulta de cuenta y el envío ocurren fuera de la respuesta HTTP para no exponer esas diferencias por latencia.
- Validación estricta, origen permitido, límite de cuerpo de 4 KB, respuesta no almacenable y límites por IP/correo. Se limita el trabajo pendiente a 20 envíos y 4 restablecimientos simultáneos por instancia.
- El enlace usa fragmento de URL, que el frontend retira del historial al abrirlo. El token viaja al backend en el cuerpo de un POST, no en rutas ni parámetros de consulta. No se incluye en trazas de IA ni logs.
- Consumir el token bloquea la fila de usuario, revalida estado/vencimiento y actualiza contraseña, elimina tokens y revoca sesiones en una transacción. Dos consumos simultáneos solo permiten un éxito.
- Las cuentas bloqueadas no reciben ni consumen enlaces. Los cambios administrativos invalidan sus enlaces pendientes. Recuperar no modifica el rol, no desbloquea la cuenta y no inicia sesión automáticamente.
- El inicio de sesión revalida contraseña/estado bajo bloqueo al crear sesión; una contraseña verificada antes de un restablecimiento no permite crear una sesión después del cambio.
- Un fallo de envío invalida el token correspondiente sin devolver detalles SMTP al cliente. Sin configuración SMTP, la solicitud devuelve 503 para cualquier correo y explica que la recuperación no está disponible.

## Consecuencias y deuda

La cola de envío y los límites son locales al proceso. Un reinicio puede interrumpir una entrega aceptada; se necesita cola persistente y límites compartidos antes de operar con varias instancias. La aceptación HTTP no demuestra entrega al buzón. Faltan configuración del proveedor y prueba real con el estudiante. En el entorno local el enlace apunta a localhost; usuarios en otros dispositivos requieren frontend accesible y HTTPS.

No se implementaron MFA, verificación inicial del correo, cambio de contraseña desde Perfil, alertas de seguridad ni historial de dispositivos en este cambio; se proponen como backlog adicional. No se cambió la contraseña de ninguna cuenta real para probar.

## Verificación y fuentes

Pruebas: `password-recovery.test.ts`, `password-recovery.test.tsx` y casos REC-DB del esquema temporal en `admin-database.test.ts`. Evidencia: `docs/evidencias/recuperacion-contrasena/`.

- OWASP: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- Nodemailer SMTP: https://nodemailer.com/smtp
- Google, contraseñas de aplicación: https://support.google.com/accounts/answer/185833?hl=es
- Brevo, autenticación de dominio: https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC

Uso significativo de IA generativa: ChatGPT/Codex apoyó diseño, implementación, pruebas y documentación. El estudiante debe revisar, comprender y sustentar el contenido antes de su incorporación al informe.
