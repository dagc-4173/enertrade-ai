# Verificación de capacidad obligatoria para transar

7 de octubre de2026. Instrucción expresa del estudiante cambia el requisito anterior: la verificación dejó de ser solo informativa. Relación C21/C21b, HU-20 y refinamientos Mercado; no se crea HU ni estimación retrospectiva. Validación académica pendiente.

## Comportamiento implementado
Leyenda: “La cantidad supera el límite de capacidad declarado para la simulación.” También se actualiza presentación de motivos históricos sin modificar sus snapshots. Toda publicación ACTIVE sin aprobación vigente se expone como BLOCKED y se muestra Inactiva · requiere verificación. Este es un estado operativo derivado, no un nuevo enum persistido ni una cancelación: se preservan estados históricos y saldos. Rechazada, NO_REFERENCE, sin auditoría, OUTDATED, regla desconocida y legacy sin hora no se negocian. La aprobación de ambas partes es necesaria. Nueva pestaña Inactivas y vista inicial Todas para poder verificar/corregir.

GET/market y matching filtran por aprobación vigente. POST/transactions y batch, PATCH pendiente, counter y accept vuelven a comprobar la pareja dentro de la misma transacción Serializable y bloqueos de publicaciones. Repositorios sin comprobación de aprobación fallan de forma cerrada. El frontend invalida propuestas seleccionadas si cualquiera deja de estar disponible. Guardar perfil refresca inmediatamente la tabla. Perfil o cantidad cambiados exigen verificar nuevamente.

Acuerdos CONFIRMED, sus pagos e historial se conservan. Pendientes no se cancelan automáticamente ni liberan reserva por este cambio; quedan impedidos para confirmar/modificar hasta verificar ambas partes. Cancelar/rechazar sigue disponible. Para bajar una cantidad por debajo de reservas, primero cancelar/rechazar las propuestas correspondientes. No se borraron publicaciones del usuario ni se alteraron confirmaciones anteriores.

## Pruebas ejecutadas
98 pruebas backend aprobadas en energy-transaction.test.ts, energy-marketplace.test.ts, market-balance.test.ts y publication-verification.test.ts; fixtures unitarios de negociación existentes ahora representan explícitamente aprobaciones. Frontend:45 pruebas aprobadas en cinco archivos, incluidas43 regresiones y GATE-UI-01/02. TypeScript backend, lint y build frontend aprobados.

18 casos HTTP+PostgreSQL local en base de pruebas separada:8 GATE-INT y10 HOUR-INT. Fixtures limpiados. Los perfiles/aprobaciones se crean explícitamente para los casos horarios; no se desactiva el requisito para pruebas. El arnés tuvo una primera ejecución fallida por nombre incorrecto del campo de resumen de matching; corregido, repetido con fixtures nuevos y limpieza. No confundir ese fallo del arnés con un resultado aprobado del producto.

| ID | Precondición/pasos | Esperado/obtenido | Estado |
|---|---|---|---|
| GATE-INT-01 | Nuevas oferta/demanda, sin verificar; consultar mercado y proponer individual/lote | BLOCKED; mercado vacío;409sin escribir | Aprobada |
| GATE-INT-02 | Verificar sin perfil | NO_REFERENCE; propuesta409 | Aprobada |
| GATE-INT-03 | Cantidad10, capacidad9 | REJECTED; leyenda capacidad;BLOCKED;0matches | Aprobada |
| GATE-INT-04 | Aprobar solo oferta, luego demanda | Bloqueo mientras falte demanda; propuesta201 tras ambas | Aprobada |
| GATE-INT-05 | Cambiar perfil tras propuesta | OUTDATED; accept/counter409; mercado vacío;pendiente intacta | Aprobada |
| GATE-INT-06 | Rechazar verificación y después corregir/aprobar | Accept bloqueado; despuésCONFIRMED | Aprobada |
| GATE-INT-07 | Cambiar cantidad tras aprobar y enviar lote mixto | BLOCKED/OUTDATED; rollback completo;1acuerdo previo | Aprobada |
| GATE-INT-08 | Cambiar perfil después de confirmación | Confirmada conservada | Aprobada |

## Navegador
Cuenta temporal exclusivamente en base test, origen127.0.0.1:5174. Nueva oferta10.25kWh para08/10/2026 hora13-14: sinverificar y Inactivas(1), Activas(0). Perfil capacidad10 produjo rechazo con leyenda corregida y estado inactivo. Perfil capacidad10.25 y nueva verificación reactivaron publicación y mostraron aprobación. Datos propios del estudiante no usados. Captura verificacion-obligatoria-rechazada.png conservada para TG-II. La eliminación de fixtures se comprobó al cerrar el entorno. No se afirma reejecución completa del navegador comprador para cada casoAPI.

## Archivos
publication-trading-eligibility.ts, publication-verification.summary.ts/rules.ts, energy-transaction.service.ts, offer/demand/market.service.ts; Marketplace, HourlyMarket, PublicationVerification, contratos/filtros frontend; pruebas y verification-gate-integration.ts. No se requiere migraciónDB. ADR-verificacion-obligatoria-capacidad.md supersede la decisión informativa anterior.
