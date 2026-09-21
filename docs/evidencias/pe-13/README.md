# PE-13 - Negociacion bilateral con contrapropuestas

## ID

PE-13

## Nombre

Negociacion bilateral con contrapropuestas.

## Objetivo

Verificar negociacion manual de cantidad y precio entre comprador y vendedor, incluyendo historial de revisiones y confirmacion final.

## Alcance

C21b y C21c.

## Requisitos/HU relacionados

- Propuestas provisionales C21b y C21c del backlog Marketplace.
- HU-21 y HU-22 como antecedentes funcionales de las publicaciones simuladas.

No se crea ni se asigna una historia de usuario oficial nueva.

## Precondiciones

- Dos partes con acceso a una transaccion energetica simulada.
- Una negociacion iniciada y disponible para intercambio de terminos.
- Interfaz de historial de revisiones disponible.

## Datos de prueba observados

| Elemento | Valor observado |
| --- | --- |
| Referencia corta de transaccion | `febde357` |
| Rol mostrado | Vendedor |
| Estado final | Confirmada |
| Entrega | 02/10/2026 |
| Revision 1 | Comprador: 50.000,00 kWh; 420,00 COP/kWh; 21.000.000,00 COP |
| Revision 2 | Vendedor: 50.000,00 kWh; 440,00 COP/kWh; 22.000.000,00 COP |
| Revision 3 | Comprador: 50.000,00 kWh; 435,00 COP/kWh; 21.750.000,00 COP |
| Termino vigente/final | 50.000,00 kWh; 435,00 COP/kWh; 21.750.000,00 COP |
| Aceptaciones | Comprador: Aceptado; Vendedor: Aceptado |

## Pasos ejecutados

1. Una parte inicio la negociacion.
2. Se propusieron cantidad y precio.
3. La contraparte recibio los terminos.
4. Se genero una contrapropuesta.
5. Las partes alternaron revisiones.
6. Se conservo el historial.
7. El receptor del ultimo termino lo acepto.
8. Ambas partes quedaron aceptadas.
9. La transaccion paso a `CONFIRMED`.

## Resultado esperado

La negociacion conserva revisiones inmutables de cantidad, precio y total; el termino vigente corresponde a la ultima revision aceptada por ambas partes y la transaccion pasa a confirmada.

## Resultado obtenido

Se conservaron tres revisiones, en el orden comprador -> vendedor -> comprador. Cada revision preservo cantidad, precio y total. El termino vigente coincidió con la revision 3; ambas aceptaciones estuvieron presentes; el estado mostrado fue Confirmada y el historial permanecio visible desde la interfaz.

## Estado

**APROBADA TECNICAMENTE.** La validacion academica/formal permanece pendiente de la revision final del informe.

## Evidencia

### Evidencia visual pendiente de incorporacion al repositorio

- `pe13-01-negociacion-confirmada-historial.png`

No se incluye enlace porque el archivo no esta incorporado al repositorio.

## Limitaciones

- No hay pagos reales.
- No hay liquidacion financiera.
- No implica entrega fisica de energia.
- La transaccion energetica es simulada.
- La prueba real de concurrencia para contrapropuestas simultaneas permanece como validacion separada mientras no se ejecute.

## Relacion con objetivo especifico

Se relaciona principalmente con OE3 y OE4. Esta evidencia no afirma el cumplimiento total de dichos objetivos.

## Observacion academica

La evidencia refleja una prueba funcional manual observada. No constituye validacion academica o formal de la negociacion.
