# Catálogo de artefactos predictivos

## Objetivo

El incremento expone metadata técnica, métricas y limitaciones de los artefactos predictivos activos, sin modificar la inferencia existente.

## Commit de implementación

`9fe707f`

## Endpoints

- `GET /models`
- `GET /models/:id`
- `GET /models/:id/metrics`

## Artefactos activos

1. `xm-gene-ridge @ 1.0.0`
   - `kind`: `model`
   - `type`: `ridge`
   - generación agregada XM
   - no diferenciada por tecnología

2. `xm-demandasin-ridge @ 1.0.0`
   - `kind`: `model`
   - `type`: `ridge`
   - demanda agregada SIN
   - no zonal
   - no temperatura
   - no precio
   - no meteorología
   - confidence no definido

3. `xm-preciobolsnaci-b1 @ 1.0.0`
   - `kind`: `rule`
   - `type`: `deterministic_baseline`
   - no es machine learning
   - `P_hat(D,p) = P(D-1,p)`

## Fuentes de verdad

La API obtiene los datos desde los loaders validados existentes:

- `backend/src/models/xm-gene-ridge/model-loader.ts`
- `backend/src/models/xm-gene-ridge/evaluation-loader.ts`
- `backend/src/models/xm-demandasin-ridge/model-loader.ts`
- `backend/src/models/xm-preciobolsnaci-b1/rule-loader.ts`

Esta evidencia no duplica los valores completos de `coefficients` ni del `scaler`.

## Arquitectura

Componentes del incremento:

- `backend/src/services/model-catalog.contract.ts`
- `backend/src/services/model-catalog.service.ts`
- `backend/src/controllers/model-catalog.controller.ts`
- `backend/src/app.ts`

Flujo:

```text
HTTP
  -> model catalog controller
  -> model catalog service
  -> loaders validados
  -> artefactos versionados
```

## Ecuaciones

Ridge:

```text
y_hat = beta0 + Σ beta_j ((x_j - mu_j) / sigma_j)
```

Precio B1:

```text
P_hat(D,p) = P(D-1,p)
```

La API no calcula nuevas ecuaciones ni nuevas métricas; solo proyecta metadata y evaluaciones existentes.

## Validación técnica

Resultados ejecutados:

- Tests específicos: 10 passed, 0 failed, 44 assertions.
- Suite backend: 518 passed, 0 failed, 1658 assertions, 13 files.
- Typecheck: PASS.
- `git diff --check`: PASS.

No se afirma validación mediante CI remoto.

## Trazabilidad

El incremento se relaciona principalmente con:

- HU-05: métricas de oferta.
- HU-07: métricas de demanda.
- HU-18: versiones de modelos.

También tiene relación transversal con:

- HU-04.
- HU-06.
- HU-08.

Esta evidencia no marca nuevas historias de usuario como completadas.

## Estado

- Implementado: sí.
- Probado técnicamente: sí.
- Versionado: sí.
- Desplegado en producción: no demostrado.
- Validación académica/formal: pendiente.

## Limitaciones

- La generación todavía es agregada.
- No hay generación diferenciada por tecnología.
- La demanda no usa meteorología.
- El precio activo sigue siendo un baseline determinístico.
- El catálogo no modifica los modelos.
- El catálogo no crea intervalos de confianza.
- El incremento no representa la validación académica final.
