# Pago simulado de acuerdos confirmados

Estado: implementado y probado localmente, autorizado por el estudiante. Validación académica pendiente.

## Contexto y alternativas
EnerTrade AI es un prototipo de intercambio simulado. Se comparan un proveedor externo en sandbox y un simulador interno persistente. Se elige el simulador interno para evitar dependencias y permitir pruebas deterministas sin tarjetas ni dinero real.

## Decisión
Pago separado del estado de negociación. Solo comprador y acuerdo CONFIRMED permiten iniciar/resolver intentos. Comprador/vendedor consultan historial y comprobante; terceros no acceden. Escenarios explícitos APPROVED, REJECTED, PENDING. Importe exacto en COP tomado del acuerdo en backend; el cliente no envía importes ni datos bancarios.

Cada intento mantiene snapshot del acuerdo, proveedor/versiones, fecha, resultado y clave de idempotencia. Una repetición de la misma clave devuelve el intento existente; reutilizarla con otro escenario se rechaza. Rechazados permiten nuevos intentos. Un pendiente debe resolverse antes de otro intento. Resultados finales son inmutables; repetir una resolución idéntica es seguro. Bloqueo de transacción, aislamiento Serializable e índices parciales garantizan máximo un aprobado y un pendiente por acuerdo. Solo aprobados tienen referencia de comprobante; la descarga PDF identifica siempre simulación.

## Consecuencias y límites
No altera reservas, cantidades o aceptaciones. No incluye pagos por lote multihora, reembolsos, conciliación bancaria, callbacks externos, SLA ni vencimiento automático de pendientes. El importe conserva precisión decimal del acuerdo; visualización COP puede redondear, el comprobante guarda el valor exacto. Los datos de prueba no equivalen a liquidación ni entrega de energía.

## Trazabilidad
Refinamiento del flujo transaccional C21b; HU-20 para integración y evidencia. No asignar números nuevos ni story points retrospectivos. No modificar objetivos TG-I ni declarar pagos reales. Apoyo de ChatGPT en implementación y pruebas; validación académica pendiente.


## Evidencia
Ver docs/evidencias/pago-simulado/README.md: 46 pruebas backend, 39 frontend y nueve casos reales HTTP/PostgreSQL aprobados; paneles de comprador/vendedor inspeccionados en navegador.
