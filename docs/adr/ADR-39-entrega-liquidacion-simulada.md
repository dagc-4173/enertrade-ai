# ADR-39 — Entrega y liquidación proporcional simuladas

Fecha: 2026-10-31. Decisión autorizada por el estudiante en la conversación; implementada y probada en desarrollo, no desplegada.

## Contexto

El pago v1 aprueba todo el importe sin registrar entrega. El asesor pregunta por el comprador cuando se entregan 8.000 de 10.000 kWh. El sistema es un prototipo transaccional y su pago actual no mueve dinero. La ampliación es de TG-II; no sustituye el alcance histórico de TG-I ni se adjudica a una HU completada sin modificar el backlog.

## Alternativas

1. Ajustar manualmente el importe pagado: sencillo, pero modifica el acuerdo original y pierde trazabilidad.
2. Libro adicional de entrega y liquidación simuladas: conserva acuerdo/pago, separa verificación y pago proporcional; añade una tabla y un flujo de revisión.
3. Custodia real y medidores: requieren proveedores y verificación fuera del alcance actual.

## Decisión

Usar la alternativa 2 sin nuevas tecnologías. Simulador interno v2 identifica nuevos pagos retenidos; v1 conserva su semántica. HELD se deriva de pago aprobado v2 sin declaración; SimulatedSettlement persistente pasa a REVIEW, DISPUTED o SETTLED. No se actualiza el estado comercial CONFIRMED ni se altera su precio/cantidad o el comprobante original.

Solo vendedor declara cantidad/referencia, solo comprador acepta o disputa; puede disputar HELD si no hay declaración. Solo administrador activo ajeno a ambas partes resuelve una disputa. El admin no puede resolver acuerdos propios, incluso si solo hay un administrador. Las acciones se habilitan al final de la hora de Colombia o del día si no hay hora. Sin silencio positivo, liquidación automática, multas ni sobreentrega: cantidad entre cero y la pactada.

Pago proveedor = cantidad aceptada × precio acordado. Devolución = importe reservado − pago proveedor. Decimal con precisión 60, persistencia siete decimales; UI COP redondea solo para presentación. Importe total se conserva. Aceptación usa la cantidad declarada; la resolución administrativa puede determinar otra cantidad dentro del acuerdo y requiere motivo.

Transacción Serializable y bloqueo FOR UPDATE sobre EnergyTransaction para cada operación. Una sola fila por acuerdo. Eventos anexados atómicamente con actor, rol, fecha, payload y requestKey; misma clave/datos/actor repite lectura y clave con otros datos falla. SETTLED es final. Conflicto de serialización se informa 409 para actualizar/reintentar. GET no crea datos. Las respuestas no exponen actorId, payload ni requestKey.

## Consecuencias y límites

Entrega, retención y devolución son exclusivamente simuladas; sin bancos, custodia, factura o control físico. Referencia de evidencia declarativa, sin archivos ni verificación externa. No existe vencimiento de disputa: requiere intervención humana; un comprador inactivo deja la revisión pendiente. Cola administrativa limitada a 100 casos, con actualización manual. Se conserva historial interno pero no se promete inmutabilidad frente a operadores de base de datos. No hay agregados financieros ni integración regulatoria. Futuras mediciones o pagos reales exigen diseño específico.

## Evidencia

Ver docs/evidencias/proteccion-comprador/README.md y scripts/settlement-postgres-validation.ts. PostgreSQL aislado verificó migración, cuatro acuerdos, entrega completa/parcial/nula, aceptación duplicada y dos resoluciones simultáneas con un único ganador. Aceptación en Azure pendiente.
