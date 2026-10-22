# ADR-36 — Gestión de sesiones propias y desplegables de Perfil

Estado: implementado y probado técnicamente en entorno local; pendiente aceptación del estudiante y despliegue.

## Contexto y trazabilidad

El estudiante autorizó continuar con gestión de sesiones y pidió que Cambiar contraseña fuese un desplegable similar a Detalles técnicos de la cuenta. Continúa ADR-33/34/35 y amplía gestión de cuentas en TG-II. No se renumeran historias heredadas ni se asigna sprint/story points sin refinamiento. Correo continúa pendiente por decisión previa.

## Alternativas y decisión

Se comparó exponer el hash del token, construir un identificador derivado temporal y añadir UUID público de gestión. Se eligió UUID independiente generado en PostgreSQL para no exponer token ni hash, conservar estabilidad entre reinicios y simplificar el cierre selectivo. La migración aditiva asigna UUID a sesiones existentes; la autenticación sigue usando el token anterior y no las invalida.

GET /auth/sessions lista únicamente sesiones propias activas, con UUID, inicio, vencimiento y marca de sesión actual. POST /auth/sessions/:id/revoke cierra otra sesión propia. POST /auth/sessions/revoke-others cierra todas las otras activas. Las rutas autentican, validan origen/cuerpo/parámetros y no aceptan userId. Se usa bloqueo de fila del usuario y revalidación de sesión/estado bajo transacción, coordinada con cambios de contraseña y bloqueo de cuenta. La sesión actual se cierra mediante el control habitual Cerrar sesión; intentar cerrarla desde el listado devuelve conflicto. Identificadores ajenos o vencidos se rechazan sin confirmar pertenencia.

Cambiar contraseña y Sesiones activas son details/summary nativos, cerrados inicialmente. Conservan interacción de teclado y foco nativos. La consulta de sesiones se inicia al abrir su desplegable; las revocaciones requieren confirmación dentro del panel. La interfaz informa solamente fechas existentes; no inventa navegador, dispositivo o ubicación. Actualizar sesiones refresca la consulta.

## Consecuencias y límites

Las fechas de inicio/vencimiento no son un registro de actividad ni una ubicación. No se añaden IP o user-agent porque no eran datos existentes ni necesarios para este alcance. No se concede a administradores cierre selectivo de otras cuentas; su bloqueo/cambio de acceso ya revoca sesiones según ADR-33. Una pestaña cerrada a distancia detecta la revocación en la siguiente solicitud o comprobación periódica. No se crea una sesión persistente adicional.

Conservar tests y evidencia en docs/evidencias/sesiones-activas. El cambio es técnico; no acredita validación académica ni despliegue. Uso significativo de IA: apoyo de ChatGPT/Codex en diseño, implementación y pruebas, sujeto a revisión y comprensión por el estudiante.
