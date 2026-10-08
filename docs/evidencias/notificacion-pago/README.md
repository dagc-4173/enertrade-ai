# Aviso al comprador de transacciones por pagar

## Clasificación de vigencia
Evidencia histórica útil para la presentación del aviso y navegación, pero sin commit de origen en resultados.json. El fixture de navegador preparó un acuerdo CONFIRMED por SQL y no ejercitó publicación, verificación ni aceptación en UI/API. El runner C4 actual prepara esos pasos mediante API y queda pendiente de reejecución aislada; esta captura no acredita por sí sola ese recorrido, no sustituye la evidencia C4 actual y no representa una validación completa del marketplace vigente.

Las credenciales de browser fixture son aleatorias y su archivo se crea bajo el directorio temporal del sistema; la raíz configurable fuera de temp se rechaza. El cleanup normal reintenta borrado de datos/archivo y reporta errores. Una terminación abrupta del proceso puede omitir `finally`; no se garantiza cleanup ante terminación forzada. El modo `0600` se solicita al sistema operativo, pero los ACL efectivos de Windows no han sido auditados.

Implementado localmente el7/10/2026 por instrucción del estudiante. C21b/HU-20 y refinamiento del pago simulado; sin nueva HU o estimación retrospectiva. No se hizo commit ni despliegue. Validación académica pendiente.

## Comportamiento
Aviso persistente en el panel autenticado (Inicio y otras páginas) cuando el usuario es comprador de uno o más acuerdosCONFIRMED sin pagoAPPROVED. Botón Revisar pagos navega a Transacciones. UNPAID (sin intento o rechazado) y PENDING se distinguen: pendientes requieren resolución. Sin compras pendientes, aviso oculto; seller-only y terceros no reciben conteos ajenos.

GET /simulated-payments/payables requiere sesión, devuelve solo unpaidCount,pendingCount,totalCount,simulated=true, sin identificadores o historiales. Dos counts en snapshot RepeatableRead; filtro buyerUserId tomado de sesión y scope de integración conservado. No modifica transacciones o pagos. Sin nueva tabla/migración ni notificación externa. No hay emails/push ni centro de notificaciones persistidas.

Carga al entrar/cambiar página, sondeo cada30segundos únicamente con pestaña visible y evento local después de aceptación/pago/resolución. Un cambio desde otra cuenta se refleja en la siguiente consulta; no se promete actualización instantánea entre equipos. Consultas compactas sin solicitar un historial por cada transacción. Errores de carga se muestran y no se presentan como cero pagos.

## Pruebas ejecutadas
9 pruebas frontend (payment-notification.test.tsx y simulated-payment.test.tsx) aprobadas: aviso singular/plural y CTA, pendiente separado, desaparición con cero, contrato autenticado/coherente y regresiones de PDF/pago. Backend TypeScript y frontend lint/build aprobados.

12 casos HTTP+PostgreSQL reales del script payment-integration.ts:9 regresiones previas y3 nuevos. PAY-NOTICE-INT-01:una confirmada y otra sin aceptar; esperado401sin sesión, comprador1, vendedor/tercero0; obtenidoigual. PAY-NOTICE-INT-02:rechazo seguido de pendiente; esperado0porpagar+1pendiente, obtenidoigual. PAY-NOTICE-INT-03:aprobar pendiente; esperado0avisos, obtenidoigual. Todos aprobados, fixtures limpiados. No sumar este rerun a resultados históricos para inflar cobertura.

## Navegador real
Dos cuentas temporales en enertrade_integration_test y un acuerdo confirmado preparado como fixture SQL (no se reejecutó aquí publicación/verificación/negociación). Inicio del comprador mostró “Tienes una transacción por pagar”. Revisar pagos llevó a Transacciones; se abrió la negociación y el panel de pago. Al registrar APPROVED el aviso desapareció mediante actualización inmediata del evento local; quedó el comprobante. La preparación SQL es precondición controlada para probar notificación, no evidencia de aceptación UI. La privacidad vendedor/terceros y pendientes se verificó en API.

Captura aviso-transaccion-por-pagar.png, código/pruebas y este registro son evidenciaTG-II. Cuentas y filas temporales limpiadas y archivo de credenciales eliminado; User=0 y pagos=0 en base test, datos dev del usuario preservados. ChatGPT apoyó implementación y verificación; revisión estudiante/asesor pendiente.

## Archivos
backend simulated-payment.service/controller y script de integración; frontend BuyerPaymentNotification.tsx, AppRouter, simulatedPaymentService, SimulatedPaymentPanel, Transactions, App.css; pruebas y documentación. payment-notice-browser.ts es el arnés visual aislado y requiere guard explícito test/disposable.

Revisión final del resaltado de filas completada en navegador: ver ../resaltado-pagos/README.md. Sin pagar y pendiente se resaltan; aprobado retira el resaltado.
