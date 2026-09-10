
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

Configura `DATABASE_URL`, `AUTH_SDK_API_KEY` y `AUTH_SDK_APP_ID` en el entorno
o en `.env`, usando `.env.example` como referencia sin sobrescribir valores
locales existentes. No versiones credenciales reales.

Prisma CLI, Client, adaptador PostgreSQL y configuración se fijan en `7.8.0`.
Genera el cliente después de instalar las dependencias; generar el cliente no
aplica migraciones. Las migraciones requieren un procedimiento separado y la
revisión previa del estado de la base de datos.

`bun.lock` es el lockfile oficial. `package-lock.json` se conserva temporalmente,
pendiente de retiro posterior; no debe utilizarse para instalar el backend.
El comando `bun test` queda documentado para la suite del proyecto: actualmente
no hay una suite propia persistida, por lo que no acredita funcionalidades probadas.

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

## Configuración del SDK de autenticación

Desde `backend/`, crea `.env` a partir de `.env.example` si todavía no existe.
Si ya existe, añade las variables faltantes sin sobrescribir `DATABASE_URL`.

- `AUTH_SDK_APP_ID`: identificador de aplicación asignado por el servicio de autenticación.
- `AUTH_SDK_API_KEY`: clave privada del SDK para esa aplicación.

Ambas variables son obligatorias. El servicio carga `.env` mediante `dotenv` y
rechaza la configuración ausente, vacía o compuesta solo por espacios antes de
crear el SDK. El error indica los nombres de las variables, nunca sus valores.
Mantén también la configuración existente de `DATABASE_URL`.

`.env` está ignorado por Git. No incluyas credenciales reales en `.env.example`
ni en archivos versionados. La clave anteriormente expuesta en código debe
rotarse en el servicio de autenticación y actualizarse en el entorno local;
trasladarla a `.env` no invalida la clave anterior ni la elimina del historial.
