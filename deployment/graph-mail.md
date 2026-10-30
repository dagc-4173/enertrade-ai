# Recuperación por Microsoft Graph

Extensión de ADR-34 (autenticación y cuentas, refinamiento TG-II sin renumerar HU heredadas). Outlook personal requiere autorización delegada. Se conserva SMTP como alternativa; Graph usa HTTPS, Mail.Send y User.Read para comprobar la identidad durante el alta. No cambia el token de recuperación, su vencimiento, la respuesta genérica ni la revocación de sesiones.

## Configuración en la VM

Registrar aplicación compatible con cuentas Microsoft personales, agregar Graph/Mail.Send delegado y habilitar flujos de cliente público. User.Read permite comprobar que la cuenta autorizada corresponde al remitente. No requiere secreto de cliente ni URI de redirección para el flujo de dispositivo.

En `.env.deploy` privado definir:

```dotenv
MAIL_PROVIDER=graph
GRAPH_CLIENT_ID=311d4504-af1b-415a-b68e-3a32635f02d5
GRAPH_TOKEN_FILE=/app/data/mail/graph.json
MAIL_FROM=dagc-4173@hotmail.com
```

Conservar FRONTEND_ORIGIN por medio de PUBLIC_ORIGIN HTTPS de Compose. SMTP no se usa al seleccionar graph. Reconstruir y recrear app; ejecutar en la terminal de la VM:

```bash
sudo docker compose --env-file .env.deploy exec app bun scripts/authorize-graph-mail.ts
```

El propietario abre la URL oficial mostrada, ingresa el código y autoriza exclusivamente la cuenta esperada. No compartir códigos ni tokens. El asistente no envía correo. Escribe el refresh token en el volumen evidence con directorio 0700 y archivo 0600 en Linux. No lo incorpora al repositorio, imagen ni respuestas HTTP. Se renueva con cada acceso expirado, persiste la rotación por reemplazo atómico y comparte la renovación entre solicitudes del mismo proceso. Solo soporta una instancia de app; no coordina varios procesos. Quien controla Docker o root también puede leer el archivo privado. Una revocación de Microsoft exige repetir la autorización.

## Verificación

Pruebas automatizadas con proveedor simulado: configuración inválida, concurrencia, persistencia de rotación, identidad del remitente y fallos de autenticación/envío sin exponer detalles. No certifican entrega real.

Aceptación manual pendiente: solicitar recuperación desde la web pública para una cuenta de prueba registrada, recibir el correo, comprobar HTTPS y vencimiento/uso único, restablecer y verificar sesión anterior revocada. No guardar enlace, tokens ni contraseña en capturas. Registrar resultado real como evidencia TG-II; no marcar validado antes de ejecutarlo.

Referencias: https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0 ; https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code ; https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens
