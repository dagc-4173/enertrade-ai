# Autenticacion minima de la demo

Estado: implementada y probada tecnicamente. Validacion academica/formal pendiente.
Incremento transversal de acceso a la demo; no se le asigna una HU inexistente.
Los contratos funcionales HU-01..HU-09 se conservan. No se implementa autorizacion
API por usuario ni aislamiento de datasets: el guard protege la interfaz principal.

## Contrato y migracion

POST /auth/register {name,email,password} -> 201 {user}; no inicia sesion.
POST /auth/login {email,password} -> 200 {user} + cookie HttpOnly.
GET /auth/me -> 200 {user} o 401 UNAUTHENTICATED.
POST /auth/logout {} -> 204 y revocacion persistida de la sesion.
User publico: id, email, name, createdAt. Nunca passwordHash.

Argon2id nativo de Bun 1.3.13, memoryCost=65536 KiB, timeCost=2.
Cookie SameSite=Lax, HttpOnly, Path=/auth, 8 horas; Secure en production.
PostgreSQL guarda solo SHA-256 del token aleatorio de 32 bytes.
Sin secretos en localStorage. CORS usa FRONTEND_ORIGIN exacto con credenciales.

Migracion nueva: 20260917000000_add_auth. SQL aditivo: User, AuthSession, indices
unico email, userId, expiresAt y FK AuthSession -> User con cascade.
Antes de aplicar, prisma migrate diff contra el schema anterior: No difference detected.
Cuatro migraciones anteriores finalizadas; tablas auth ausentes.
Se ejecuto migrate deploy. El envoltorio Python fallo al decodificar la salida del
proceso; no se repitio deploy. migrate status posterior confirmo 5 migraciones y
Database schema is up to date. Consulta SQL confirmo auth:
started_at=2026-09-16T21:38:05.787Z; finished_at=2026-09-16T21:38:06.618Z.
Estos tiempos proceden de _prisma_migrations, no de una fecha inferida.

## Pruebas automatizadas

| ID | Precondicion / accion | Resultado esperado y obtenido | Estado |
|---|---|---|---|
| AUTH-A01 | Express local, repositorio sustituido, hashing real; bun test src/tests/auth.test.ts | 12 pass, 0 fail, 41 assertions; registro, email duplicado, entrada invalida, login, expiracion, rotacion, me, logout, origen, parser y error seguro | Probado |
| AUTH-A02 | Regresion backend; bun test | 493 pass, 0 fail, 1590 assertions | Probado |
| AUTH-A03 | Frontend; bun test tests | 42 pass, 0 fail, 74 assertions; incluye 14 tests auth y 28 Predictions | Probado |
| AUTH-A04 | bun x tsc --noEmit en backend | Exit 0 | Probado |
| AUTH-A05 | npx.cmd tsc -b --pretty false; npm.cmd run lint; npm.cmd run build en frontend | Todos exit 0 | Probado |

Los tests frontend cubren servicios, parser, estado de sesion, fallo de logout,
guard y render de formularios; el comportamiento interactivo se verifica aparte
en Chrome. No se agrego framework ni dependencia. El caso heredado de dataset
que esperaba validacion del SDK se actualizo al nuevo contrato auth, manteniendo
la asercion de cero escrituras de datasets.

## Integracion HTTP real

Express localhost:3000, Prisma y PostgreSQL de desarrollo reales; script temporal
por stdin. Origin localhost:5173. No XM, entrenamiento ni llamada a forecast.
Cuenta conservada: demo-auth-43e6edae-d4c7-443a-b04c-d7f21adf5156@example.test.
User ID: 5e7cced3-c7ed-4122-9db3-c97aed1261b8.
Contrasena aleatoria no registrada en evidencia ni archivos.

| ID | Accion | Resultado esperado y obtenido | Estado |
|---|---|---|---|
| AUTH-I01 | Preflight auth/login | 204; allow-credentials=true | Probado |
| AUTH-I02 | Registrar cuenta nueva | 201; usuario persistido con Argon2id; respuesta sin hash | Probado |
| AUTH-I03 | Repetir email | 409 | Probado |
| AUTH-I04 | Login incorrecto | 401 | Probado |
| AUTH-I05 | Login correcto | 200; cookie HttpOnly y SameSite=Lax; una sesion en SQL | Probado |
| AUTH-I06 | /me con cookie | 200; mismo usuario publico que registro | Probado |
| AUTH-I07 | Logout y reutilizacion de cookie anterior | 204, luego /me 401; cero sesiones para usuario | Probado |

Antes/despues HTTP: EnergyDataset 40/40, PreparedDataset 39/39,
PriceForecastExecution 6/6; User 0/1; AuthSession 0/0 (una durante login).
No se borraron datasets, preparados, trazas ni usuarios previos.

## Demo y limites

Abrir http://localhost:5173 con backend en localhost:3000. FRONTEND_ORIGIN debe
coincidir exactamente; no mezclar localhost y 127.0.0.1. Registrar una nueva cuenta
identificable usando una contrasena elegida por el estudiante para la sustentacion.
Las contrasenas aleatorias de prueba no son credenciales entregables.

Pendientes fuera de alcance: verificacion email, recuperacion, MFA, OAuth, roles,
autorizacion de APIs/datasets por usuario y limpieza periodica de sesiones expiradas.
Limite de intentos es local en memoria: 30 por IP/15 minutos. No es distribuido.
Otras paginas conservan mocks previos; autenticacion no convierte sus datos en reales.
No se afirma aptitud de produccion. No se hizo commit.

## Verificacion interactiva Chrome

Precondicion: frontend Vite y Express activos, cuenta nueva no personal.
Cuenta creada desde React: demo-browser-1789594861999@example.test.
User ID leido en PostgreSQL: ccbe2688-b6c7-408d-90cb-8b211d9c6f47.
No se conserva la contrasena en evidencia.

| ID | Accion | Resultado esperado y obtenido | Estado |
|---|---|---|---|
| AUTH-UI01 | Abrir interfaz sin cookie | Login visible; dashboard oculto | Probado |
| AUTH-UI02 | Ir a Crear cuenta, completar y enviar | Cuenta creada; vuelve a login con aviso | Probado |
| AUTH-UI03 | Enviar contrasena incorrecta | Mensaje visible de credenciales incorrectas | Probado |
| AUTH-UI04 | Login correcto | Dashboard con nombre Demo navegador y Cerrar sesion | Probado |
| AUTH-UI05 | Recargar con sesion | /me restaura acceso y nombre | Probado |
| AUTH-UI06 | Cerrar sesion | Vuelve a login | Probado |
| AUTH-UI07 | Recargar despues de logout | Login; no dashboard | Probado |

Se observaron estados de procesamiento y botones deshabilitados durante solicitudes.
Las observaciones proceden del navegador real; no se guardaron capturas ni HAR.
Para TG-II conviene capturar login, registro, nombre autenticado y logout durante
la sustentacion, evitando mostrar contrasenas o cookies.

Conteos SQL finales tras ambas pruebas: EnergyDataset=40, PreparedDataset=39, PriceForecastExecution=6, User=2, AuthSession=0. git diff --check: correcto.
