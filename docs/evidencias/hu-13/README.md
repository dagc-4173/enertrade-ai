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

La integracion manual PostgreSQL/HTTP queda pendiente de una ejecucion temporal verificable; no se afirma como realizada.

Ver [ADR-18](../../adr/ADR-18-analisis-deterministico-patrones.md).