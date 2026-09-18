# Evidencia tecnica — HU-13: Consultar patrones identificados

## Estado

| Dimension | Estado |
| --- | --- |
| Backend HU-13 | Implementado |
| Pruebas automatizadas | Probado tecnicamente |
| Validacion academica/formal | Pendiente |
| Despliegue | Pendiente |

## Contrato

`GET /patterns` requiere `requireAuth` y devuelve `200 []` cuando no hay resultados. Los filtros opcionales y estrictos son `from`, `to`, `dataType` y `variable`. Las fechas son `YYYY-MM-DD`; el rango es valido cuando `from <= to`.

El filtro temporal es por interseccion del periodo analizado: $periodStart <= to$ y $periodEnd >= from$. El orden es `createdAt DESC, id DESC`. La respuesta publica incluye `analysisId`, estado, tipo, variable, periodo, muestra, metodo, patrones, advertencias y `createdAt`; no incluye dataset crudo, IDs internos del preparado, usuarios, sesiones, tokens o detalles Prisma.

No se implementan filtros `zone` o `user`. Los perfiles XM/SIN disponibles no contienen esos atributos consultables y el backend no implementa RBAC: el rol documental no equivale a una autorizacion tecnica.

## Pruebas ejecutadas

`patterns.test.ts` cubre rango, tipo, variable, combinacion, vacio, ausencia de autenticacion, filtros invalidos, orden e higiene del contrato publico. Resultado focalizado: 11 aprobadas, 0 fallidas.

## Integracion PostgreSQL y HTTP

Con la sesion temporal autenticada y el analisis persistido `9a8ca1b0-d119-420e-8829-a2a1346d140e`, `GET /patterns?dataType=demanda&variable=demanda_kwh` respondio HTTP 200, devolvio un arreglo e incluyo el analisis. La consulta temporal con `from=2024-04-01&to=2024-04-07` tambien lo incluyo.

Se verifico la higiene del contrato publico: la respuesta no expuso `preparedDatasetId`, contenido crudo, `userId`, tokens ni campos internos de Prisma. Tras cerrar el servidor se eliminaron exclusivamente la fila temporal y la sesion temporal; los conteos PostgreSQL retornaron a `PatternAnalysis=0` y `PreparedDataset=39`.

Ver [ADR-18](../../adr/ADR-18-analisis-deterministico-patrones.md).