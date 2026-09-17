# Evidencia técnica — Marketplace de ofertas y demandas

## 1. Identificación

- Proyecto: EnerTrade AI
- Incremento: Marketplace de ofertas y demandas
- Tipo: funcionalidad transaccional simulada
- Commit funcional: `7426228417a2db0b20004d0239eb0747bb7b79fd`
- Rama: `main`
- Estado: Implementado y probado técnicamente. Validación académica/formal pendiente.

El commit documentado coincide con `HEAD` y `origin/main` al momento de redactar esta evidencia.
No se declara despliegue en producción.

## 2. Objetivo del incremento

El incremento permite que un usuario autenticado:

- registre ofertas energéticas;
- registre demandas energéticas;
- consulte exclusivamente sus propios registros;
- conserve persistencia en PostgreSQL;
- visualice cantidades y precios con formato legible;
- utilice esta información posteriormente como insumo del emparejamiento.

No ejecuta compraventa real, no realiza liquidación financiera y no implementa matching todavía. Corresponde a un entorno académico/simulado.

## 3. Alcance implementado

- Creación de oferta.
- Creación de demanda.
- Listado de ofertas propias.
- Listado de demandas propias.
- Aislamiento por usuario.
- Validaciones de entrada.
- Autenticación mediante sesión.
- Persistencia PostgreSQL.
- Interfaz Marketplace.
- Formato numérico `es-CO`.

Fuera de alcance:

- Edición.
- Cancelación.
- Matching.
- Transacciones.
- Negociación.
- Pagos.
- Listados públicos.

## 4. Arquitectura implementada

Flujo implementado:

```text
Usuario autenticado
  -> React Marketplace
  -> API Express
  -> middleware requireAuth
  -> servicio de oferta/demanda
  -> Prisma
  -> PostgreSQL
```

Modelo conceptual:

```text
User 1 --- N EnergyOffer
User 1 --- N EnergyDemand
```

## 5. Modelo de datos

`EnergyOffer` contiene:

- `id`
- `userId`
- `quantityKwh`
- `pricePerKwh`
- `deliveryDate`
- `status`
- `createdAt`
- `updatedAt`

`EnergyDemand` contiene:

- `id`
- `userId`
- `quantityKwh`
- `maxPricePerKwh`
- `deliveryDate`
- `status`
- `createdAt`
- `updatedAt`

Precisiones Prisma/PostgreSQL:

- `quantityKwh`: `DECIMAL(20,2)`.
- `pricePerKwh`: `DECIMAL(18,5)`.
- `maxPricePerKwh`: `DECIMAL(18,5)`.
- `deliveryDate`: `DATE`.
- `status` inicial: `ACTIVE`.

La migración Marketplace real versionada es:

```text
20260917010000_add_energy_marketplace
```

Fue aplicada exitosamente mediante `bun x prisma migrate deploy` y posteriormente `prisma migrate status` confirmó que el esquema estaba actualizado.

Nota de trazabilidad: `20260917000000_add_auth` es la migración de autenticación. La ruta `20260917000000_add_energy_marketplace` no existe en el repositorio; se documenta el nombre real versionado para evitar atribuir una ruta inexistente.

## 6. Contratos API

### `POST /offers`

- Propósito: crear una oferta del usuario autenticado.
- Autenticación: requerida.
- Éxito: `201`.
- Body: `quantityKwh`, `pricePerKwh`, `deliveryDate`.
- Validaciones: objeto JSON, campos permitidos, números finitos mayores que cero y fecha `YYYY-MM-DD` válida.

### `GET /offers/mine`

- Propósito: listar las ofertas del usuario autenticado.
- Autenticación: requerida.
- Éxito: `200`.
- Orden: `createdAt DESC`.
- No expone publicaciones de otros usuarios.

### `POST /demands`

- Propósito: crear una demanda del usuario autenticado.
- Autenticación: requerida.
- Éxito: `201`.
- Body: `quantityKwh`, `maxPricePerKwh`, `deliveryDate`.
- Validaciones: objeto JSON, campos permitidos, números finitos mayores que cero y fecha `YYYY-MM-DD` válida.

### `GET /demands/mine`

- Propósito: listar las demandas del usuario autenticado.
- Autenticación: requerida.
- Éxito: `200`.
- Orden: `createdAt DESC`.
- No expone publicaciones de otros usuarios.

`userId` no se acepta desde frontend. La identidad se obtiene desde la sesión autenticada.

## 7. Autenticación y aislamiento

- Cookie: `enertrade_session`.
- `HttpOnly`.
- `SameSite=Lax`.
- `Secure` en producción.
- `Path=/`.
- Expiración: 8 horas.
- Middleware: `requireAuth`.
- Usuario autenticado: `req.authUser`.
- Identidad para persistencia: `req.authUser.id`.

No se documentan valores de token, `tokenHash`, `passwordHash`, `DATABASE_URL` ni credenciales.

## 8. Formato numérico

El formato es exclusivamente de presentación. Los valores permanecen numéricos en frontend, API y PostgreSQL; no se almacenan valores formateados.

Se usa `Intl.NumberFormat("es-CO")`.

Ejemplos verificados:

```text
9851831.89
-> 9.851.831,89 kWh

252444558.83
-> 252.444.558,83 kWh

412.5
-> $412,50 COP/kWh

960.71104
-> $960,71104 COP/kWh
```

También se aplicó formato visual a `ExternalDataSources`, sin alterar el backend ni los valores recibidos de XM.

## 9. Pruebas automatizadas

Resultados ejecutados:

### Backend

```text
508 pass
0 fail
1614 expect() calls
12 archivos
```

### Prueba Marketplace backend

```text
15 pass
0 fail
23 expect() calls
```

### Auth

```text
12 pass
0 fail
42 expect() calls
```

### Frontend

```text
49 pass
0 fail
3 archivos
```

### Marketplace frontend

```text
7 pass
0 fail
26 expect() calls
```

Validaciones adicionales ejecutadas:

- Typecheck backend: correcto.
- Typecheck frontend: correcto.
- `prisma validate`: correcto.
- Lint frontend: correcto.
- Build frontend: correcto.
- `git diff --check`: correcto.

## 10. Prueba de integración HTTP real

Prueba realizada contra Express, PostgreSQL real y dos usuarios temporales. No se registran correos ni contraseñas.

Usuario A:

- Registro: `201`.
- Login: `200`.
- `POST /offers`: `201`.
- `POST /demands`: `201`.
- `GET /offers/mine`: `200`.
- `GET /demands/mine`: `200`.

Usuario B:

- Registro: `201`.
- Login: `200`.
- `GET /offers/mine`: `200`, 0 registros.
- `GET /demands/mine`: `200`, 0 registros.

Validaciones:

- `userId` extra: `400`.
- `quantityKwh=0`: `400`.
- `maxPricePerKwh=0`: `400`.
- Acceso sin sesión: `401`.
- Acceso después de logout: `401`.

## 11. Prueba funcional en navegador real

Usuario A:

- Registro.
- Login.
- Navegación a Marketplace.
- Publicación de una oferta.
- Publicación de una demanda.
- Visualización de formatos `es-CO`.
- Recarga.
- Persistencia.
- Logout.

Usuario B:

- Registro.
- Login.
- Marketplace vacío.
- No visualizó los registros de A.
- Logout.

Resultados observados:

Oferta:

```text
9851831.89
412.5
2026-09-18
ACTIVE
```

Demanda:

```text
252444558.83
960.71104
2026-09-18
ACTIVE
```

UI:

```text
9.851.831,89 kWh
$412,50 COP/kWh
252.444.558,83 kWh
$960,71104 COP/kWh
18/09/2026
Activa
```

## 12. Verificación PostgreSQL

En la prueba de navegador:

- Usuario A: 1 oferta / 1 demanda.
- Usuario B: 0 ofertas / 0 demandas.
- 0 sesiones activas después del logout.

Los conteos globales observados al final fueron:

```text
EnergyOffer = 2
EnergyDemand = 2
```

Estos conteos incluían además los registros de la prueba HTTP anterior. No representan datos de producción ni datos reales de mercado.

## 13. Evidencia visual

Durante la prueba funcional en navegador se verificaron visualmente:

- Marketplace A con oferta y demanda.
- Marketplace B con listas vacías.

Las capturas fueron observadas durante la prueba funcional en navegador y su incorporación como archivos versionados queda pendiente.

## 14. Trazabilidad

| Elemento | Evidencia |
|---|---|
| Funcionalidad | Registro y consulta de ofertas/demandas |
| Backend | Controladores y servicios de offers/demands |
| Persistencia | `EnergyOffer` / `EnergyDemand` |
| Migración | `20260917010000_add_energy_marketplace` |
| Autenticación | `requireAuth` + sesión |
| Frontend | `Marketplace.tsx` |
| Formato | `numberFormat.ts` |
| Prueba backend | `energy-marketplace.test.ts` |
| Prueba frontend | `marketplace.test.tsx` |
| Prueba integración | HTTP real + PostgreSQL |
| Prueba funcional | Navegador real |
| Commit | `7426228417a2db0b20004d0239eb0747bb7b79fd` |

## 15. Limitaciones y deuda técnica

- No existe matching implementado.
- No existe edición.
- No existe cancelación.
- No existen transacciones ni pagos.
- Marketplace solo consulta registros propios.
- Al recargar, la navegación vuelve inicialmente a Dashboard porque la vista activa no está representada en la URL.
- La UI actualmente representa `ACTIVE` como `Activa`.
- Validación académica/formal pendiente.

Estas limitaciones no se presentan como fallos del MVP.

## 16. Estado final

- Diseñado: sí
- Implementado backend: sí
- Implementado frontend: sí
- Migración aplicada: sí
- Persistencia real: sí
- Pruebas automatizadas: sí
- Integración HTTP real: sí
- Prueba navegador real: sí
- Aislamiento por usuario: sí
- Código versionado: sí
- Validación académica/formal: pendiente
