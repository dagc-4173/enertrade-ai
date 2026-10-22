# Mercado y Transacciones: mejoras frontend — 2026-10-21
Estado: implementado y probado localmente. Sin despliegue ni certificación de validación académica. Usuario autorizó únicamente simulación transitoria: no se crearon cuentas, publicaciones, transacciones ni pagos.

Transacciones: filtro de atención basado en reglas existentes canAccept/canCounter/canReject; todas/requieren respuesta/esperando/finalizadas; filtro por fecha y estado con contadores calculados sobre selección coherente. Se consulta listado completo del usuario para filtrar localmente; sin nueva API. Condiciones vigentes visibles, acuerdo y pago en columnas independientes; historial como línea de tiempo con revisión vigente; acciones destructivas diferenciadas; aceptar es acción principal. Navegación móvil compacta y scroll restringido a tabla.

Mercado: accesos de exploración, publicaciones y creación (habilitados tras carga); tarjetas de publicaciones externas con día, franjas, saldo y rango de precios; resumen previo con energía, horas y total. No se alteran verificaciones ni reglas de reserva.

Archivos: Marketplace.tsx/css, Transactions.tsx/css, HourlyMarket.tsx, utils/transactionPresentation.ts; pruebas transaction-presentation.test.ts y matching-negotiation.test.tsx.

Verificación: 241 pass, 0 fail, 1050 aserciones en 24 archivos. Build final y lint aprobados (lint anterior al último ajuste de visibilidad de navegación durante carga). TX-VIEW-01 verifica ambos roles, revisión vigente y finalizadas; TX-VIEW-02 combina fecha, estado y atención sin mutar datos. MATCH-CTA-01 confirma resumen y publicaciones externas con fixture en memoria.

Navegador autenticado: 20 transacciones existentes, 0 pendientes; filtro de respuesta produce vacío explícito. Fecha 07/10/2026 muestra cinco registros: una confirmada, dos rechazadas y dos canceladas; restaurado a todas las fechas. Transacciones móvil390px/documento375px sin desbordamiento de página. Acceso Crear publicación abre editor de oferta después de cargar; no se envía. Capturas adjuntas. Tarjetas externas e interacción con pendientes cubiertas con pruebas transitorias: no había datos activos para comprobarlas manualmente. No se ejecutaron mutaciones persistentes.

Trazabilidad: cambios de presentación sobre publicaciones, matching y negociación existentes; no se declara cierre integral de historias. Conservar evidencia para TG-II. Uso IA: Codex implementó y verificó; revisión del estudiante pendiente.
