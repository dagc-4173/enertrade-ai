# Revisión final del resaltado de pagos

Fecha: 7 de octubre de 2026, America/Bogota. C21b/HU-20. Validación académica pendiente; sin commit ni despliegue.

La revisión visual antes bloqueada por el límite de uso de Codex se completó con dos cuentas temporales en la base local separada de pruebas. El arnés payment-notice-browser.ts publica, verifica capacidad y confirma mediante la API real. Su primer intento devolvió400 porque enviaba cantidades/precios de publicación como cadenas; se corrigieron esos datos al contrato numérico, manteniendo el resto del arnés, y se ejecutó nuevamente.

| ID | Precondición y pasos | Esperado y obtenido | Estado |
|---|---|---|---|
| PAY-ROW-BROWSER-01 | Comprador inicia sesión; acuerdo confirmado sin pago; Revisar pagos | Fila amarilla, borde lateral, etiqueta Por pagar y clase transaction-unpaid | Aprobada |
| PAY-ROW-BROWSER-02 | Registrar pago simulado PENDING | Pago pendiente de resolución; clase transaction-unpaid conservada | Aprobada |
| PAY-ROW-BROWSER-03 | Resolver pendiente APPROVED | Pagada en simulación; clase ausente; cero filas resaltadas y aviso retirado | Aprobada |

Capturas: fila-transaccion-por-pagar.png y fila-transaccion-pagada.png. La revisión anterior ya había ejecutado 11 pruebas frontend y12 casos HTTP+PostgreSQL, TypeScript, lint y build; no se duplicaron esos conteos ni se presentan como reejecutados aquí. git diff --check y TypeScript del backend se comprobaron al cierre de esta revisión.

Fixtures y credenciales temporales limpiados: User=0 y SimulatedPaymentAttempt=0 en base test. Datos de desarrollo del estudiante preservados. Conservar código, pruebas y estas capturas para TG-II. ChatGPT apoyó implementación, pruebas y revisión visual; revisión del estudiante/asesor pendiente.