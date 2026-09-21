# C20i - CORS para edicion de publicaciones

## Causa

Las rutas `PATCH /offers/:id` y `PATCH /demands/:id` ya existían y el cliente
las invocaba. Sin embargo, el preflight del backend anunciaba únicamente
`GET, POST, OPTIONS`. Desde el origen autorizado, el navegador bloqueaba PATCH
antes de alcanzar las reglas de negocio y el cliente lo clasificaba como error
de red.

## Cambio

El middleware CORS de `backend/src/app.ts` ahora anuncia
`GET, POST, PATCH, OPTIONS`. Conserva el origen exacto configurado en
`FRONTEND_ORIGIN`, credenciales, headers `Content-Type, Accept` y ausencia de
wildcards. No habilita `PUT` ni `DELETE`.

## Cobertura y riesgo

Las pruebas HTTP cubren preflight PATCH autorizado para ofertas y demandas, y
verifican que un origen distinto no reciba cabeceras permisivas. Las pruebas de
Marketplace cubren PATCH válido de publicación y sus bloqueos de negocio.

La validación manual pendiente consiste en recargar el frontend desde el origen
autorizado, editar una oferta o demanda ACTIVE y comprobar que recibe la
respuesta real del backend. No se afirma que esta prueba manual haya sido
ejecutada.