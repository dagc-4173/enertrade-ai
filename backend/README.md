
# Arqutectura del proyecto

## Entorno de desarrollo

El runtime y gestor de paquetes oficial del backend es **Bun 1.3.13**.
Ejecuta los siguientes comandos desde `backend/`:

| Operación | Comando |
| --- | --- |
| Instalar dependencias desde el lockfile | `bun install --frozen-lockfile` |
| Iniciar desarrollo | `bun run dev` |
| Generar Prisma Client | `bun --bun run prisma generate` |
| Ejecutar pruebas | `bun test` |

Configura `DATABASE_URL` y `FRONTEND_ORIGIN` en el entorno
o en `.env`, usando `.env.example` como referencia sin sobrescribir valores
locales existentes. No versiones credenciales reales.

Prisma CLI, Client, adaptador PostgreSQL y configuración se fijan en `7.8.0`.
Genera el cliente después de instalar las dependencias; generar el cliente no
aplica migraciones. Las migraciones requieren un procedimiento separado y la
revisión previa del estado de la base de datos.

`bun.lock` es el lockfile oficial. `package-lock.json` se conserva temporalmente,
pendiente de retiro posterior; no debe utilizarse para instalar el backend.
La suite persistida se ejecuta con `bun test`; sus resultados se registran por incremento.

## Config
Configuraciones del sistema. configuracion a servicios externos

## Controlers
Registro de rutas de la aplicación

## Services
Hace validaciones y contiene la logica del negocio.

## Middlewares
Es una función que se ejecuta en el pipeline de una petición HTTP y puede leer, modificar o detener el flujo antes de llegar al controlador.

## Utils
Funciones reutilizables a lo largo del programa

## Autenticacion local de la demo

El registro heredado del SDK externo fue sustituido por autenticacion local.
No se requieren AUTH_SDK_APP_ID ni AUTH_SDK_API_KEY para ejecutar estas rutas.
Las credenciales antiguas expuestas deben seguir considerandose revocables; este
cambio no elimina secretos del historial.

- POST /auth/register: JSON {name,email,password}, 201 {user}.
- POST /auth/login: JSON {email,password}, 200 {user} y cookie de sesion.
- GET /auth/me: cookie, 200 {user}; 401 si falta, expiro o fue revocada.
- POST /auth/logout: JSON {}, 204, revoca la sesion y elimina la cookie.
- user solo expone id, email, name y createdAt.

Email normalizado con trim/lowercase y restriccion unica. Nombre de 1 a 100
caracteres. Registro requiere contrasena de 12 a 128 caracteres, sin reglas de
composicion arbitrarias. Argon2id nativo de Bun (64 MiB, timeCost=2). No se guarda
texto plano. Token aleatorio de 32 bytes, solo SHA-256 en AuthSession, duracion
absoluta de 8 horas. Cookie HttpOnly, SameSite=Lax, Path=/, Secure en production.
Logout elimina la sesion; /me comprueba expiracion. Las sesiones expiradas no
conceden acceso; su limpieza periodica queda pendiente.

FRONTEND_ORIGIN debe coincidir exactamente con el origen Vite. En desarrollo,
usar localhost para ambos (no mezclar localhost y 127.0.0.1). CORS permite
credenciales solo a ese origen. Se rechazan POST con Origin ajeno y solicitudes
cross-site; el despliegue previsto es same-site y HTTPS en produccion.
Limite en memoria: 30 intentos login/registro por IP cada 15 minutos, parser 8 KiB.
El limite no es distribuido ni persiste reinicios. No configurar trust proxy
sin evaluar antes la topologia de despliegue.

La migracion 20260917000000_add_auth solo agrega User y AuthSession. Revisar SQL
antes de aplicar con bun --bun run prisma migrate deploy; generar el cliente con
bun --bun run prisma generate. No usar db push.

El guard protege el frontend principal. Los contratos API HU-01..HU-09 conservan
su acceso previo: no se implementa autorizacion por usuario ni aislamiento de
sus datasets en este incremento. No publicar este prototipo como servicio
multiusuario protegido sin esa ampliacion. No hay verificacion de email,
recuperacion de contrasena, OAuth, MFA ni roles.
