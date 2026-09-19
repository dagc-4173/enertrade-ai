# Preparación Técnica Para Despliegue

Este documento prepara el proyecto para un despliegue configurable. No selecciona
ni configura un proveedor de hosting y no constituye evidencia de despliegue.

## Requisitos

- Bun 1.3.13.
- PostgreSQL accesible mediante `DATABASE_URL`.
- Dependencias instaladas desde los lockfiles de cada aplicación.

## Variables de entorno

Backend, desde `backend/.env.example`:

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexión PostgreSQL; es obligatoria y secreta. |
| `FRONTEND_ORIGIN` | Origen exacto del frontend. |
| `NODE_ENV` | Usar `production` en el entorno productivo. |
| `PORT` | Puerto TCP; entero entre 1 y 65535, por defecto 3000. |
| `XM_API_BASE_URL` | Base pública de XM; tiene valor por defecto documentado. |
| `WEATHER_EVIDENCE_DIR` | Directorio persistente para evidencia meteorológica si se habilita. |

Frontend, desde `frontend/.env.example`:

| Variable | Uso |
| --- | --- |
| `VITE_API_BASE_URL` | URL HTTP(S) pública del backend, sin secretos, consulta ni fragmento. |

`VITE_API_BASE_URL` se incorpora al bundle y no tiene fallback a localhost. No
versionar archivos `.env` con secretos.

## Comandos

Desde `backend/`:

```powershell
bun install --frozen-lockfile
bun run typecheck
bun run migrate:deploy
bun run start
```

`migrate:deploy` se ejecuta de forma explícita antes del arranque; el servidor
no aplica migraciones automáticamente. No usar `migrate dev`, `migrate reset` ni
`db push` en producción.

Desde `frontend/`:

```powershell
bun install --frozen-lockfile
bun run build
```

Construir el frontend con la `VITE_API_BASE_URL` del entorno de destino.

## Health y red

`GET /health` no requiere autenticación. Responde `200` con dependencia de base
de datos `ok`, o `503` con estado `degraded`, sin exponer secretos. Es apto para
un health check del proveedor.

El backend escucha con el host por defecto de Express; no requiere una variable
`HOST` adicional. CORS concede origen y credenciales sólo si `Origin` coincide
exactamente con `FRONTEND_ORIGIN`; nunca usa `*` con credenciales.

## Cookies y topología

Las cookies son `HttpOnly`, `SameSite=Lax`, `Path=/` y usan `Secure=true` cuando
`NODE_ENV=production`. Esto es viable para frontend y backend HTTPS same-site.
Una topología cross-site requiere revisar `SameSite`, `Secure`, CORS y CSRF.

## Artefactos y pendientes

Los artefactos versionados de supply, demand y price se cargan con rutas relativas
a sus módulos (`import.meta.url`), no con rutas absolutas de la máquina. Deben
permanecer incluidos en el artefacto de runtime.

Antes de elegir proveedor: definir topología de dominios, almacenamiento persistente
para evidencia meteorológica si aplica, gestión de secretos, backup de PostgreSQL y
`trust proxy` sólo tras conocer la red inversa del proveedor.