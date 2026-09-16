# Pipeline histórico PrecBolsNaci — evidencia técnica HU-08

## Alcance

Importación mediante HU-01, validación HU-02 y preparación HU-03 de precio histórico
XM/SINERGOX PrecBolsNaci, unidad COP/kWh, granularidad horaria expresada como
fecha calendario y periodo 1..24. No se infiere correspondencia UTC/local.

Este incremento no completa HU-08. No existe aún modelo de precio ni endpoint de estimación.

Decisión: [ADR-12](../../../adr/ADR-12-precio-referencia-mercado-xm.md).
Validación académica/formal pendiente.

## Integración real ejecutada

Precondición común: aplicación Express local con Prisma/PostgreSQL reales y
proveedor XM real; script temporal por stdin, sin mocks ni archivos de ejecución
versionados. Conteos iniciales: EnergyDataset **23**, PreparedDataset **23**.
Rango solicitado: **2024-04-01..2024-04-01**.

| ID | Acción | Resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|---|
| PREC-INT-01 | POST /external-data/import con xm/PrecBolsNaci y el rango indicado | 201, registro recibido y mapeo preservado | 201; EnergyDataset 53; precios; recibido; 24 registros; pendingOptionalFields=[] | Probado |
| PREC-INT-02 | POST /datasets/53/validate | 200, ruleset de precio aprobado | 200; xm_preciobolsnaci_base@1.0.0; aprobado; 24 registros; 0 errores; 0 advertencias; issues=[]; canProceed=true | Probado |
| PREC-INT-03 | POST /datasets/53/prepare | 200, artefacto nuevo y contenido preservado | 200; PreparedDataset 34; xm_preciobolsnaci_preparacion_base@1.0.0; reused=false | Probado |
| PREC-INT-04 | Repetir POST /datasets/53/prepare | Mismo artefacto, reused=true | 200; ID 34 y preparedAt iguales; reused=true; una fila por clave compuesta | Probado |
| PREC-INT-05 | Comparar lecturas directas SQL con HTTP y respuesta normalizada XM | Contenido y procedencia coherentes; filas previas intactas | Comparaciones correctas; contenido fuente intacto; informe persistido; índices 0..23; conteos finales 24/24 | Probado |

Source real:

```text
XM/SINERGOX;metric=PrecBolsNaci;unit=COP/kWh;startDate=2024-04-01;endDate=2024-04-01;mapping=xm-preciobolsnaci-v1
```

Primera observación: `fecha_xm=2024-04-01`, `periodo=1`,
`precio_cop_kwh=768.17121`. Última: `fecha_xm=2024-04-01`, `periodo=24`,
`precio_cop_kwh=858.17121`. Valores obtenidos de la consulta real de esta ejecución.

PostgreSQL confirmó columnas obligatorias exactas y registros iguales al mapeo de
la respuesta normalizada XM; `validatedAt` e informe persistidos; preparado con
`sourceDatasetId=53`, ruleset de origen y versiones 1.0.0 correctos.
El contenido preparado y transformations coincidieron con HTTP; identidad temporal
por fecha/periodo, sin zona, timestamp o features derivadas. Las filas existentes
antes de la ejecución permanecieron iguales en las comparaciones completas.
EnergyDataset 53 y PreparedDataset 34 quedaron conservados.

No se ejecutó concurrencia real ni se observó un P2002 real en esta integración.
La recuperación se cubrió automatizadamente con un error sustituido.

## Pruebas automatizadas

Desde backend:

- `bun test src/tests/preciobolsnaci.test.ts src/tests/external-data.test.ts`:
  106 aprobadas, 0 fallidas, 353 aserciones.
- `bun test`: 404 aprobadas, 0 fallidas, 1217 aserciones; incluye regresión de
  Gene, DemaSIN y HU-04/HU-05/HU-06/HU-07.
- `bun --bun run tsc --noEmit --incremental false -p tsconfig.json`: correcto.
- `git diff --check`: correcto.

Las pruebas sustituyen transporte/Prisma. Cubren mapeo, fuente/unidad, precisión,
vacío y errores XM sin escritura, contrato, fechas/periodos/precios inválidos,
duplicados, ceros/negativos, día incompleto y orden arbitrario; preparación,
inmutabilidad, estados/informes incompatibles, idempotencia y ganador P2002.
No constituyen por sí solas prueba de PostgreSQL real; esa evidencia se separa arriba.

## Limitaciones

Un día no acredita continuidad histórica ni suficiencia para modelado. No hay
entrenamiento, baseline, corpus ML o selección de algoritmo de precio en este
incremento. El precio es referencia histórica de mercado, no liquidación,
recomendación financiera, precio personalizado ni negociación real.
Oferta/demanda comerciales siguen pendientes. La importación no es idempotente.
Este documento resume resultados ejecutados; no afirma capturas, HAR ni logs
persistidos que no se guardaron.
