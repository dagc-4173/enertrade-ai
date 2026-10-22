# ADR-35 — Cambio de contraseña propia desde Perfil

Estado: implementado y probado técnicamente en entorno local; pendiente aceptación del estudiante y despliegue.

## Contexto y trazabilidad

El estudiante autorizó continuar con las recomendaciones de seguridad. Se implementa el primer paso: cambio de contraseña desde Perfil. Amplía la gestión de cuentas de TG-II y complementa ADR-33/34. No se asignan HU nuevas, puntos o sprint sin refinamiento; tampoco se declara completada una HU académica por esta implementación aislada.

## Alternativas y decisión

Se comparó cerrar todas las sesiones frente a renovar la actual y cerrar las demás. Se eligió renovar la actual, exigiendo contraseña actual, para mantener continuidad sin conservar el identificador de sesión previo. No se requiere correo: su envío continúa pendiente por decisión del estudiante.

POST /auth/change-password obtiene la identidad exclusivamente de la cookie. El cuerpo admite solo currentPassword/newPassword. La nueva debe ser diferente y tener 12–128 caracteres; la interfaz requiere confirmación. Se valida la actual con Argon2id y se prepara el nuevo hash antes de la transacción.

La transacción bloquea la fila del usuario y revalida sesión, estado activo, vencimiento y hash anterior. Actualiza contraseña, elimina enlaces de recuperación y todas las sesiones previas y crea una nueva con token aleatorio. Conserva el vencimiento original, rol y datos de la cuenta. No puede cambiar contraseñas de terceros. Una carrera con bloqueo, recuperación, cierre de sesión o cambio previo se rechaza sin escrituras parciales.

Se aplican autenticación, origen permitido, JSON de hasta 4 KB, cinco intentos por cuenta/15 minutos y máximo cuatro operaciones simultáneas por instancia. La cookie renovada es HttpOnly/SameSite=Lax, Secure en producción; no se devuelve token ni hashes en JSON. No se envían avisos por correo mientras el proveedor siga pendiente.

## Consecuencias y verificación

No requiere migración nueva ni cambia contraseñas reales durante pruebas. Los límites son en memoria, coherentes con ADR-34; varias instancias requieren límites compartidos. La respuesta HTTP exitosa mantiene la sesión local mediante Set-Cookie. Si el cliente pierde la respuesta después del commit, deberá iniciar sesión con la contraseña nueva.

Pruebas de servicio/HTTP, frontend y PostgreSQL temporal: docs/evidencias/cambio-contrasena/README.md. No se afirman MFA, verificación de correo o historial de dispositivos implementados. Son pasos posteriores que deben mantenerse separados del alcance probado.

Uso significativo de IA: ChatGPT/Codex apoyó diseño, implementación, pruebas y documentación; revisión y comprensión del estudiante pendientes para incorporación académica.
