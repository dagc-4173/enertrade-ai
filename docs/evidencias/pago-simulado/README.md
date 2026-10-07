# Pago simulado interno

Fecha de trabajo: 7 de octubre de 2026, America/Bogota. Implementado localmente por solicitud explícita del estudiante. No se realizó commit, publicación ni despliegue de producción. Validación académica pendiente.

## Comportamiento
Solo el comprador puede iniciar o resolver el pago de una transacción CONFIRMED. El vendedor consulta el historial y comprobante; terceros no acceden. El cliente envía escenario APPROVED/REJECTED/PENDING y clave de intento, no importe, tarjetas ni datos bancarios. El servidor obtiene el importe exacto en COP del acuerdo y guarda snapshot, proveedor internal-simulator@1.0.0 y fechas.

Estado de pago separado del estado del acuerdo: UNPAID, PENDING o PAID. Rechazados permiten reintentar. Un pendiente debe resolverse antes de otro intento. Repetir la misma clave/escenario devuelve el registro original; cambiar escenario con esa clave se rechaza. Los resultados finales son inmutables. Bloqueos e índices parciales impiden más de un intento aprobado o pendiente por acuerdo.

Solo un aprobado genera referencia SIM- y comprobante explícitamente simulado, visible para comprador/vendedor y descargable en PDF. Conserva el importe exacto; la presentación monetaria puede redondearlo. No acredita cobro, entrega física de energía ni liquidación financiera. No altera saldos, reservas ni aceptaciones. Este incremento opera por transacción individual, no por lote multihora; no incluye reembolsos ni vencimiento automático de pagos pendientes.

## Archivos y API
- Modelo SimulatedPaymentAttempt y enum SimulatedPaymentStatus; migración 20261007020000_simulated_payments aplicada.
- backend/src/services/simulated-payment.service.ts y controllers/simulated-payment.controller.ts.
- frontend/src/components/SimulatedPaymentPanel.tsx, services/simulatedPaymentService.ts y página Transactions.
- POST /simulated-payments: registrar intento propio del comprador; 201 nuevo, 200 repetición segura.
- GET /simulated-payments/transactions/:id: historial y estado para participantes.
- POST /simulated-payments/:id/resolve: resolver pendiente; resolución repetida idéntica conserva comprobante.

## Pruebas ejecutadas
46 pruebas backend aprobadas, 0 fallos, en simulated-payment.test.ts, energy-transaction.test.ts y energy-transaction.controller.test.ts. Cubren importe exacto, privacidad, permisos, confirmación previa, reintentos, pendientes, idempotencia e inmutabilidad, además de regresión de negociación.

39 pruebas frontend aprobadas, 0 fallos, en simulated-payment.test.tsx, marketplace.test.tsx y matching-negotiation.test.tsx. Cubren etiqueta y formato simulado, ocultamiento de comprobantes rechazados, carga al abrir, contratos sin importe/tarjetas y regresión. TypeScript backend, lint y compilación frontend aprobados.

## Integración HTTP + PostgreSQL
Script: backend/scripts/payment-integration.ts. Tres usuarios temporales y acuerdos exclusivos de la ejecución. Nueve casos aprobados; limpieza completada solo para fixtures.

| ID | Relación | Precondición/pasos | Esperado y obtenido | Estado |
| --- | --- | --- | --- | --- |
| PAY-INT-01 | C21b/HU-20 | Sin sesión, vendedor intenta pagar y tercero consulta | 401, 403 y 404 | Aprobada |
| PAY-INT-02 | C21b/HU-20 | Intentar pago con acuerdo pendiente de aceptación | 409 | Aprobada |
| PAY-INT-03 | C21b/HU-20 | Cliente envía importe alterado | 400 | Aprobada |
| PAY-INT-04 | C21b/HU-20 | Registrar rechazo, pendiente y otro intento | Rechazo conservado; pendiente 201; nuevo intento 409 | Aprobada |
| PAY-INT-05 | C21b/HU-20 | Resolver pendiente como aprobado | 200, importe exacto 10046.2653625 COP y referencia SIM- | Aprobada |
| PAY-INT-06 | C21b/HU-20 | Repetir resolución, intentar cambiarla y pagar nuevamente | Misma referencia; cambios y segundo aprobado 409 | Aprobada |
| PAY-INT-07 | C21b/HU-20 | Vendedor consulta historial y acuerdo | PAID, dos intentos; acuerdo sigue CONFIRMED | Aprobada |
| PAY-INT-08 | C21b/HU-20 | Reenviar clave/escenario de intento rechazado | 200, mismo ID; un solo registro | Aprobada |
| PAY-INT-09 | C21b/HU-20 | Dos pagos aprobados concurrentes | Uno 201 y otro 409; solo un aprobado persistido | Aprobada |

## Navegador real
Edge, aplicación local y sesión existente. Se comprobó que el panel vendedor muestra importe del acuerdo y consulta sin acción de pago. Se comprobó el formulario comprador para un acuerdo confirmado, importe 8.550.000 COP, selector de escenarios y botón Registrar pago simulado. Se eligió Pendiente, pero no se registró intento sobre acuerdos existentes. [Captura](pago-simulado-comprador.png).

La interacción de registrar/resolver y la descarga PDF desde navegador quedan pendientes de revisión manual con fixtures; registro/resolución/concurrencia y comprobante persistente se verificaron mediante la integración real. La captura y resultados deben conservarse como evidencia para TG-II.

## Trazabilidad y uso de IA
Refinamiento del flujo transaccional C21b, pruebas HU-20; no asignar nueva HU ni story points retrospectivos. ADR-pago-simulado.md documenta alternativas y límites. ChatGPT apoyó diseño, implementación, pruebas, integración, revisión visual y documentación. Revisión del estudiante/asesor pendiente. No se afirma que exista una pasarela comercial integrada ni pagos reales.

## Refinamiento: comprobante PDF (7 de octubre de 2026)
Por solicitud del estudiante, la descarga ahora genera PDF A4 con jsPDF, cargado al solicitar el documento. Incluye referencia, fecha de aprobación en Bogotá, importe exacto sin conversión numérica, transacción, datos disponibles del snapshot, intervalo horario y aviso explícito de simulación. No se modifica el pago ni el backend.

PAY-PDF-01 (C21b/HU-20): con fixture aprobado, generar PDF; esperado cabecera PDF real, referencia, importe exacto, intervalo 23-00 y una página; obtenido correcto, aprobado. PAY-PDF-02: intentar generar con rechazado/pendiente; esperado rechazo, obtenido correcto, aprobado. Se ejecutaron seis pruebas del archivo simulated-payment.test.tsx, cero fallos; lint y build aprobados. La muestra con datos ficticios se renderizó con Poppler y se inspeccionó visualmente: sin recortes ni superposiciones. La descarga mediante clic en navegador sigue pendiente de revisión manual. Conservar generador, pruebas y esta evidencia para TG-II; no implica validación académica ni despliegue.

## Revisión de flujo en navegador
Registro/resolución de pagos ejecutados en navegador con fixtures: rechazo, pendiente y aprobación comprobados. Descarga final y revisión vendedor bloqueadas por cuota de PostgreSQL al retomar la sesión. Ver ../flujo-completo/README.md y resultados.json; no marcar la descarga como aprobada.

## Descarga real completada en local
Recorrido completo y dos descargas por clic (comprador/vendedor) ejecutados y comprobados con PostgreSQL local de pruebas el7/10/2026. PDF renderizado e inspeccionado; referencia e importe iguales. Ver ../postgresql-local/README.md.
