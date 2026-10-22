# Botones y detalle de Transacciones — 2026-10-21
Implementado y probado localmente. Sin despliegue. Sin registros nuevos ni pagos ejecutados.

Cambios: secundarios blancos con borde, foco y deshabilitado compartidos; cerrar sesión adopta estilo común; aviso Ver pagos pendientes. Filtros con contadores discretos, encabezados Por respuesta/Por estado y scroll móvil. Detalle de negociación pasa de celda final a fila independiente colspan8; máximo uno abierto, aria-expanded/controls y texto Ocultar detalle. Filas impagas blancas con marca lateral. Reglas de negocio sin cambios.

Archivos: App.css, Transactions.tsx/css, AppShell.tsx, BuyerPaymentNotification.tsx y expectativa de payment-notification.test.tsx.

Verificación: 246 pass/0 fail/1079 aserciones; build y lint aprobados antes de ajuste final exclusivo de mínimo de ancho CSS. Navegador real: detalle existente abierto con colspan8/ancho1277 frente tabla1278. Captura adjunta. Móvil390px/documento375px con detalle abierto tras ajuste; viewport restaurado. No se registraron pagos, no se modificaron acuerdos. Evidencia útil para TG-II, sin cierre integral de HU. IA: Codex apoyó implementación y comprobación; revisión del estudiante pendiente.
