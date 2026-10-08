# Configuración y validación local

7 de octubre de 2026. Instancia persistente PostgreSQL17.11 en loopback55433; desarrollo y pruebas separadas, SCRAM-SHA-256. Base Neon no conectada ni exportada en este incremento. Código previo y cambios simultáneos del estudiante conservados. No se hizo commit ni despliegue.

## Resultado ejecutado
19 migraciones aplicadas por base y status al día; backend habitual reiniciado, /health devuelve database ok. Diez casos HOUR-INT, nueve VERIFY-INT y nueve PAY-INT aprobados, cleanup completed en las tres ejecuciones; no duplicar ese conteo con pruebas anteriores. La advertencia del driver pg sobre consultas concurrentes sigue como deuda de dependencia, sin fallo observado.

## Navegador real (base test)
Dos cuentas temporales mediante browser-flow-fixture.ts y origen127.0.0.1:5174/API3001. Publicar oferta10.25kWh a980.12345COP y demanda10.25kWh máximo1000COP para14/10/2026, hora23-00. Matching:1asignación10.25kWh, pendiente0. Ir a negociar prellenó términos exactos; comprador propuso y vendedor confirmó. Pago no disponible antes de confirmar. Comprador registró REJECTED, despuésPENDING y resolvióAPPROVED: historial conserva rechazado/aprobado y pendiente no permite nuevo intento. Vendedor solo consulta y descarga, sin acción de registrar pago.

Descargas realizadas por clic en ambas cuentas: referenciaSIM-22AE9364-7872-4D1E-B536-895C211A75A9, importe exacto10046.2653625COP. Edge creó dos archivos5665bytes y abrió el primero en su visor. El evento de descarga de la automatización agotó el tiempo, pero la descarga se comprobó mediante archivos y pestaña real; no es un fallo del producto. La política del navegador impidió controlar el visor file://; se inspeccionó el archivo descargado con Poppler, sin recortes ni superposiciones. Los dosPDF contienen importe, referencia, precio, fecha y hora esperados. No comparar hash completo: metadatos de creación pueden diferir.

Precondiciones/pasos/esperado: publicación activa compatible y participantes autenticados; completar publicación→matching→propuesta→confirmación→pago→descarga. Obtenido: recorrido exitoso, roles correctos, datos exactos y PDF legible. Relación C21b/HU-20 y refinamientos Mercado. Este recorrido cierra las descargas que quedaron bloqueadas por cuota en el entornoNeon; no convierte retroactivamente aquellos casos en aprobados. No se reejecutó toda la cobertura multidía o verificación UI en este recorrido; su integración local sí se probó.

[Resultados](resultados.json), [PDF comprador](comprobante-local-comprador.pdf), [PDF vendedor](comprobante-local-vendedor.pdf), [captura vendedor](e2e-local-pago-vendedor.png). Conservar para TG-II. Revisión del estudiante/asesor y validación académica pendientes. ChatGPT apoyó instalación/configuración, ejecución y documentación; no se agregaron requisitos o HU retrospectivas.

Limpieza final: la interrupción del proceso no ejecutó su finally; se verificó la identidad exacta de las dos cuentas y se limpiaron mediante transacción en la base test, con guard de separación. Conteos finales User=0 y SimulatedPaymentAttempt=0; archivo temporal de credenciales eliminado. La base dev conserva User=0 y la aplicación quedó en Crear cuenta.
