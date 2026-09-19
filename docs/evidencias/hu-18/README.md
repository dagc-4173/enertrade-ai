# HU18 - Catalogo transversal de versiones activas

## Estado

Implementada y probada técnicamente. Validación académica y despliegue pendientes.

## Endpoint

`GET /capabilities/versions` publica, en orden determinístico, generación (`xm-gene-ridge@1.0.0`, `ml_model`), demanda (`xm-demandasin-ridge@1.0.0`, `ml_model`), precio (`xm-preciobolsnaci-b1@1.0.0`, `deterministic_rule`), matching (`matching-v1@v1`, `deterministic_method`) y patrones (`energy-pattern-descriptive@1.0.0`, `deterministic_method`). Todas son referencias activas del runtime y reportan `status: active`, `active: true`, `date: null`, `dateStatus: not_recorded`.

## Fuentes y límites

Los modelos y la regla se cargan desde sus manifests validados; matching reutiliza `matchingMethod`; patrones reutiliza `patternMethod`. No hay históricos reales, fechas semánticas registradas, Prisma adicional, MLOps externo ni RBAC. `GET /models` no se modifica.

## Trazabilidad y pruebas

HU17 registra la consulta como `capability_versions`, sin duplicar el resultado en parámetros. Las pruebas VERSION-01 a VERSION-12 verifican identidad, tipo, orden, actividad, fecha honesta, error seguro y determinismo; VERSION-10 no aplica porque no existen versiones históricas reales.