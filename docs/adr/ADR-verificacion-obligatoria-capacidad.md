# ADR: verificación de capacidad como requisito para negociar

Estado: implementado y probado localmente,7/10/2026; validación académica pendiente. Por instrucción expresa del estudiante, supersede la parte informativa/no bloqueante de ADR-verificacion-simulada-publicaciones.md.

Contexto: publicaciones sin verificar o rechazadas seguían activas y podían reservar energía. Nuevo requisito exige desactivar su participación y usar el término límite de capacidad.

Alternativas: cancelar definitivamente (impide corregir y mezcla razones); agregar enum persistido y sincronizar cada cambio de perfil/cantidad (riesgo de estado divergente); estado operativo derivado de auditoría vigente (consistencia con histórico y reactivación por verificación).

Decisión: BLOCKED derivado para publicaciones cuyo ciclo de vida es ACTIVE pero falta aprobación vigente. Mercado/matching excluyen esas filas; negociación comprueba nuevamente ambos lados dentro de la transacción Serializable. La aprobación requiere mismo perfil vigente, cantidad, fecha, hora y regla reconocida. No se cambia el enumPrisma ni se reescriben snapshots. Frontend muestra Inactiva y permite corregir/verificar; no puede enviar selección invalidada.

Consecuencias: aprobación obligatoria para nuevas propuestas y operaciones pendientes; perfiles nuevos invalidan aprobaciones anteriores. Históricos sin hora no se negocian hasta contar con publicaciones nuevas verificables. Confirmados/pagos se preservan. Reservas pendientes permanecen hasta corregir y verificar o cancelar/rechazar; ninguna confirmación se revierte automáticamente. Simulación autodeclarada sigue sin acreditar disponibilidad física real. Consultas de verificación se calculan al leer; optimización/batch posible cuando se mida necesidad.

Trazabilidad: refinamiento TG-II de Mercado y Transacciones, C21/C21b/HU-20; fuente del cambio es la solicitud del estudiante y las capturas. No se modifica la línea base académica silenciosamente ni se da HU por completada por esta decisión.
