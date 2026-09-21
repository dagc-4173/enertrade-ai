# PE-14 - Matching explicable sobre saldos disponibles

## ID

PE-14

## Nombre

Matching explicable sobre saldos disponibles.

## Objetivo

Verificar que el motor de matching utilice saldo operativo y presente resultados explicables para coincidencias completas, parciales y no compatibles.

## Alcance

C21e.

## Requisitos/HU relacionados

- Propuesta provisional C21e del backlog Marketplace.
- HU-10 como dependencia conceptual del matching, sin afirmar su completitud.

No se crea ni se asigna una historia de usuario oficial nueva.

## Precondiciones

- Marketplace con ofertas y demandas activas.
- Saldos operativos disponibles para las publicaciones aplicables.
- Sugerencias de matching ejecutadas desde la interfaz.

## Datos de prueba observados

Matching-v1 considera publicaciones `ACTIVE`, saldo operativo disponible, fecha de entrega exacta, precio de oferta menor o igual al maximo de demanda, cantidad disponible, prioridad por menor precio y antiguedad como desempate. Permite cobertura parcial y asignacion entre varias ofertas y demandas.

### Caso NO_MATCH por fecha

| Campo | Valor observado |
| --- | --- |
| Demanda | `#20de2a93` |
| Resultado | Sin coincidencia |
| Solicitado | 10.000,00 kWh |
| Asignado | 0,00 kWh |
| Pendiente | 10.000,00 kWh |
| Cobertura | 0 % |
| Ofertas utilizadas | 0 |
| Motivo | No hay ofertas disponibles para la misma fecha de entrega. |

### Caso FULL observado

| Campo | Valor observado |
| --- | --- |
| Demanda | `#f44a9bf9` |
| Resultado | Coincidencia completa |
| Solicitado | 10.000,00 kWh |
| Asignado | 10.000,00 kWh |
| Pendiente | 0,00 kWh |
| Cobertura | 100 % |
| Ofertas utilizadas | 1 |
| Oferta | `#3f4cf7d9` |
| Precio de oferta | 400,00 COP/kWh |
| Maximo de demanda | 400,00 COP/kWh |
| Margen frente al maximo | 0,00 COP/kWh |
| Entrega | 01/10/2026 |

### Caso PARTIAL observado

| Campo | Valor observado |
| --- | --- |
| Demanda | `#f44a9bf9` |
| Resultado | Coincidencia parcial |
| Solicitado | 15.000,00 kWh |
| Asignado | 10.000,00 kWh |
| Pendiente | 5.000,00 kWh |
| Cobertura | 66,67 % |
| Ofertas utilizadas | 1 |
| Motivo | La demanda recibio una cobertura parcial. |
| Oferta | `#3f4cf7d9` |
| Cantidad asignada | 10.000,00 kWh |
| Precio de oferta | 400,00 COP/kWh |
| Maximo de demanda | 400,00 COP/kWh |
| Margen frente al maximo | 0,00 COP/kWh |
| Entrega | 01/10/2026 |

## Pasos ejecutados

1. Se ejecutaron sugerencias de matching con publicaciones activas.
2. Se revisaron las tarjetas por demanda y sus asignaciones explicables.
3. Se verifico el caso sin coincidencia por fecha.
4. Se verifico una ejecucion con coincidencia completa.
5. Se verifico una ejecucion distinta con coincidencia parcial.

## Resultado esperado

El matching utiliza saldo operativo y muestra estado, cantidades solicitada, asignada y pendiente, cobertura, ofertas utilizadas, margen de precio y motivo cuando no existe cobertura total.

## Resultado obtenido

Se observaron un `NO_MATCH` explicable por fecha, una coincidencia completa y una coincidencia parcial. La interfaz mostro cobertura, detalle de la oferta utilizada y referencia corta de ejecucion. Los saldos operativos estan implementados y cubiertos por pruebas automatizadas.

## Estado

**APROBADA TECNICAMENTE.** La evidencia visual valida comportamiento funcional. La validacion academica final del criterio de matching permanece pendiente del informe y la sustentacion.

## Evidencia

El caso FULL y el caso PARTIAL corresponden a ejecuciones distintas del matching; no se presentan como resultados simultaneos. Cada evidencia visual conserva su referencia corta de ejecucion, que no se transcribe aqui al no estar el archivo visual incorporado al repositorio.

### Evidencia visual pendiente de incorporacion al repositorio

- `pe14-01-full-y-no-match.png`
- `pe14-02-partial-y-no-match.png`

No se incluye el resumen agregado de la ejecucion PARTIAL porque la captura completa correspondiente no esta incorporada al repositorio para verificarlo.

## Limitaciones

- No usa scoring, modelos ML ni pronosticos.
- No genera negociacion automatica, pagos ni liquidacion financiera.
- No implica entrega fisica de energia ni despliegue en produccion.
- La evidencia no constituye validacion academica/formal.

## Relacion con objetivo especifico

Se relaciona principalmente con OE2, OE3 y OE4. Esta evidencia no afirma el cumplimiento total de dichos objetivos.

## Observacion academica

La evidencia documenta comportamiento funcional observado y pruebas tecnicas ejecutadas. La validacion academica del criterio de matching corresponde al informe y a la sustentacion final.
