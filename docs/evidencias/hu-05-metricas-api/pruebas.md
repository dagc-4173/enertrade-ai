# HU-05 — Pruebas del endpoint

## Ejecución y alcance

Suite backend/src/tests/forecast-metrics.test.ts: HTTP real sobre loopback,
router Express y artefactos locales. Prisma sustituido por funciones que fallan
si se invocan. Sin consulta XM ni entrenamiento; comprobación de dependencias
del servicio complementaria. No se acredita aquí una integración PostgreSQL,
innecesaria para este servicio basado exclusivamente en archivos.
No se adjuntan capturas ni logs inexistentes, ni se inventa fecha de entrenamiento.

| Caso | Acción y resultado esperado | Resultado |
| --- | --- | --- |
| HU05-01 | GET sin body: 200, contrato y valores exactos, active=true, identidad de loadModel, hashes y trainedAt null/not_recorded | Aprobado |
| HU05-02 | Query de selección o body GET: 400 | Aprobado |
| HU05-03 | Evaluación ausente: 409 unavailable seguro; fallo inesperado: 500 sin detalle interno | Aprobado |
| HU05-04 | Carga única e inmutabilidad recursiva | Aprobado |
| HU05-05 | ID/version/hashes/rango/conteos/fecha de entrenamiento inconsistentes | Rechazados, aprobado |
| HU05-06 | MAE/RMSE/bias/WAPE NaN o Infinity; denominador cero/negativo/infinito; numerador negativo; unidad incorrecta | Rechazados, aprobado |
| HU05-07 | JSON inválido/modelo ausente y métricas distintas del resumen activo | Rechazados, aprobado |
| HU05-08 | Servicio sin consultas/escrituras Prisma, dependencias XM ni entrenamiento | Aprobado |

Precondición: artefactos locales de xm-gene-ridge@1.0.0 disponibles. Los casos de
error sustituyen fuentes en memoria; no se elimina ni altera el modelo productivo.
El primer test de body GET reveló que leer solo el stream no bastaba; se añadió
comprobación de cabeceras que declaran contenido. La suite final pasó.

## Resultados finales

- `bun test src/tests/forecast-metrics.test.ts`: 24 aprobadas, 0 fallidas, 38 aserciones.
- `bun test`: 258 aprobadas, 0 fallidas, 947 aserciones.
- `bun --bun run tsc --noEmit --incremental false -p tsconfig.json`: correcto.
- Comparación HTTP con valores exactos del contrato y artefacto: correcta.

HU-05 implementada y probada técnicamente dentro de este alcance.
Validación académica/formal pendiente, sin frontend avanzado.
trainedAt no registrado; métricas descriptivas del holdout fijo, sin evaluación anual.
