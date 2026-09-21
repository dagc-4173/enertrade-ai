# C21e - Matching explicable sobre saldos reales

## Alcance

El matching sigue siendo una sugerencia determinista de solo lectura. No crea negociaciones, no asigna pagos, no usa modelos predictivos ni modifica matching-v1 fuera de corregir su read model y enriquecer el diagnóstico.

## Saldo operativo

El read model de matching usa la misma función de saldo que `/market/offers` y `/market/demands`: cantidad original menos transacciones `PENDING_ACCEPTANCE` y `CONFIRMED`. La cantidad operacional se mapea al campo interno `quantityKwh` del algoritmo para conservar compatibilidad, pero no representa la cantidad original publicada.

Solo se entregan publicaciones `ACTIVE` con saldo positivo. Por ello una oferta original de 100.000 kWh con 94.000 confirmados aporta 6.000 kWh; una reserva pendiente también descuenta antes de sugerir. La misma regla aplica a demanda.

## Reglas preservadas

- ofertas activas, precio ascendente, luego antigüedad e identificador;
- demandas por antigüedad e identificador;
- fecha de entrega exacta;
- precio de oferta menor o igual al máximo de demanda;
- asignación greedy de mínimo entre saldos;
- cobertura parcial y múltiples ofertas/demandas.

## Explicación de resultados

Cada demanda devuelve solicitado, asignado, pendiente y `coveragePercent` redondeado a máximo dos decimales. Los reason codes distinguen `NO_ACTIVE_OFFERS`, `NO_SAME_DELIVERY_DATE`, `PRICE_ABOVE_MAX`, `INSUFFICIENT_AVAILABLE_QUANTITY`, `FULLY_MATCHED` y `PARTIALLY_MATCHED`.

La interfaz agrupa asignaciones por demanda y muestra referencias de ocho caracteres, cantidad, precio de oferta, máximo de demanda, margen frente al máximo y fecha. El margen es una diferencia aritmética; no representa ahorro, ganancia ni recomendación financiera. No se muestran usuarios, correos ni IDs de participantes.

## Relación con negociación y sincronización

Una incompatibilidad automática de precio no impide negociar manualmente. Matching no inicia negociaciones. Se conserva el aviso C21d de mercado desactualizado: el polling no llama matching y el usuario debe pulsar actualizar sugerencias.

## Limitaciones

Las sugerencias pueden quedar obsoletas después de su generación y no reservan energía. La validación definitiva sigue ocurriendo al crear una negociación. El cálculo no aplica scoring, forecast, patrones, ubicación ni ML.