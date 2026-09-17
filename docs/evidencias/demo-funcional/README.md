# Demo funcional integrada EnerTrade AI

## Estado

Probada técnicamente en navegador real.
Validación académica/formal pendiente.

## Fecha y hora

Ejecución observada el 2026-09-17, entre 04:58 y 05:02 UTC.

## Entorno

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- PostgreSQL real
- Navegador real
- XM vía backend

## Prueba de humo

### SMOKE-01 — Login sin sesión

Login visible sin sesión y dashboard no visible.

**Estado:** probado en navegador real.

### SMOKE-02 — Registro de cuenta demo

Cuenta demo registrada correctamente. La interfaz volvió al login con el aviso de cuenta creada.

**Estado:** probado en navegador real.

### SMOKE-03 — Login correcto

Login correcto. El dashboard quedó visible y mostró el nombre del usuario demo.

**Estado:** probado en navegador real.

### SMOKE-04 — Recarga y restauración de sesión

La recarga restauró la sesión mediante `/auth/me` y mantuvo visible el dashboard.

**Estado:** probado en navegador real.

### SMOKE-05 — Fuente externa

- Proveedor: XM
- Dataset: `Gene`
- Fecha: `2024-04-07`
- Registros visibles: 24
- Unidad: `kWh`

La consulta pasó del frontend al backend y devolvió datos visibles de XM.

**Estado:** probado en navegador real.

### SMOKE-06 — Predicción de oferta

- PreparedDataset: `17`
- Fecha objetivo: `2024-04-08`
- Predicciones: 24
- Modelo: `xm-gene-ridge@1.0.0`
- Métricas: visibles

**Estado:** probado en navegador real.

### SMOKE-07 — Predicción de demanda

- PreparedDataset: `33`
- Fecha objetivo: `2024-09-29`
- Modelo: `xm-demandasin-ridge@1.0.0`
- Métricas: visibles
- `confidence`: no definida

**Estado:** probado en navegador real.

### SMOKE-08 — Predicción de precio

- PreparedDataset: `49`
- Fecha objetivo: `2024-09-29`
- Precios: 24
- Regla: `xm-preciobolsnaci-b1@1.0.0`
- Tipo: regla determinista
- `trace.persistence`: `persisted`
- `executionId`: `eaf44b35-d704-4ed0-9d01-43803705923f`

**Estado:** probado en navegador real.

### SMOKE-09 — Logout

Logout correcto. La interfaz volvió al login y la sesión fue revocada.

**Estado:** probado en navegador real.

### SMOKE-10 — Recarga posterior

Después de recargar, el login quedó visible y el dashboard permaneció protegido.

**Estado:** probado en navegador real.

## Integridad de datos

- `EnergyDataset`: 40
- `PreparedDataset`: 39
- `PriceForecastExecution`: 7

La nueva traza creada por esta prueba es `eaf44b35-d704-4ed0-9d01-43803705923f`.

La cuenta demo más reciente tenía 0 sesiones activas después del logout. No se atribuyen otros usuarios o sesiones globales a esta prueba.

## Limitaciones

- Las APIs HU-01..HU-09 no están autorizadas por usuario.
- Los PreparedDataset `17`, `33` y `49` dependen de la base de datos demo.
- Auth es funcional para la muestra; no se declara production-ready.
- No se ejecutó entrenamiento durante la demo.
- Los modelos ya estaban entrenados y versionados.
- B1 es una regla determinista, no un modelo ML.

## Observaciones

- `ERR_ABORTED` de métricas al cambiar de vista fue informativo y no afectó el resultado.
- `401` después de logout fue esperado.
- La advertencia de `sslmode` no afectó la ejecución.

No se registran contraseñas, cookies, tokens, `DATABASE_URL`, credenciales ni datos masivos de XM.
