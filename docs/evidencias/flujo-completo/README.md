# Validación del flujo completo en navegador

## Clasificación de vigencia
Este expediente es histórico y no corresponde al gate obligatorio actual. Se ejecutó contra una base configurada compartida, no contra un destino desechable aislado; doce casos llegaron hasta pago aprobado y E2E-13/E2E-14 permanecen bloqueados. No es una validación reproducible del HEAD actual, no sustituye C4 ni representa la validación del marketplace vigente. Las capturas y filas conservan su alcance original; la captura de negociación no acredita el lote completo.

7 de octubre de 2026, America/Bogota. Ejecutada sobre código local, sin commit ni despliegue. Dos cuentas temporales, instancias frontend/API separadas de la sesión habitual; la base PostgreSQL configurada sí es compartida. No se negociaron publicaciones de usuarios existentes. ChatGPT apoyó ejecución de UI, inspección, diagnóstico y registro; revisión académica pendiente.

## Resultado
Doce casos comprobados en navegador hasta pago aprobado. Dos casos finales bloqueados por cuota del servicio de base de datos: descarga PDF desde comprador y consulta/descarga desde vendedor. No afirmar aprobación del flujo completo extremo a extremo. Los PDF y la generación ya tienen pruebas técnicas y revisión visual de muestra documentadas en ../pago-simulado/README.md; eso no sustituye esta descarga desde navegador.

El diagnóstico Prisma devolvió DriverAdapterError: “Your account or project has exceeded the quota. Upgrade your plan to increase limits.” No se cambió plan, cuota, configuración de seguridad o credenciales de usuarios existentes. Las cuentas y datos temporales no pudieron limpiarse; identificadores sin contraseñas se conservan en resultados.json para limpieza posterior. No se encontró PostgreSQL local disponible por comandos o instalación estándar. No se ejecutaron nuevas pruebas de integración durante el bloqueo.

## Casos
| ID | Pasos / precondición | Esperado | Obtenido | Estado |
|---|---|---|---|---|
| E2E-01 | Inicio de sesión de cuentas temporales vendedor/comprador | Acceso desde ambas cuentas | Acceso correcto antes de la pausa | Aprobada |
| E2E-02 | Publicar vendedor: 08/10 21-22 y 14/10 22-23, 23-00 | Tres franjas, dos cabeceras diarias, cantidades independientes | Tabla mostró 2, 5 y 10.25 kWh respectivamente | Aprobada |
| E2E-03 | Verificar oferta 23-00 sin perfil | Sin referencia simulada | Sin referencia simulada | Aprobada |
| E2E-04 | Perfil ficticio: límite 23=10.25 y 22=4; verificar ofertas | 23 aprobada; 22 excede límite | Verificada en simulación; Supera el límite simulado | Aprobada |
| E2E-05 | Publicar comprador 14/10: 22-23=5, 23-00=10.25, máximo1000 | Dos demandas activas por hora | Publicaciones registradas y coincidencias compatibles | Aprobada |
| E2E-06 | Sugerir emparejamientos | Dos asignaciones por fecha/hora | 2 demandas,3 ofertas,2 asignaciones,15.25kWh,pendiente0 | Aprobada |
| E2E-07 | Ir a negociar desde coincidencia de 23-00 | Hora seleccionada y términos exactos | 10,25 kWh y 980,12345 COP/kWh prellenados | Aprobada |
| E2E-08 | Seleccionar también 22-23, precio950 y enviar lote | Dos acuerdos independientes | 2 negociaciones registradas; cantidades10.25 y5, totales10046.2653625 y4750 | Aprobada |
| E2E-09 | Abrir comprador pendiente y confirmar ambas desde vendedor | Comprador aceptado al proponer; pago espera vendedor; despuésCONFIRMED | Sin pago antes de confirmar; ambos acuerdos confirmados por vendedor | Aprobada |
| E2E-10 | Comprador registra REJECTED sobre23-00 | Historial rechazado,reintento,sinPDF | Rechazado conservado; botón nuevo intento;0 botonesPDF | Aprobada |
| E2E-11 | Reintentar PENDING | Pendiente y ningún nuevo intento disponible | Intento pendiente; botones resolver; formulario nuevo intento oculto | Aprobada |
| E2E-12 | Resolver APPROVED | PAID,comprobante,historial,sinsegundo pago | Pagado en simulación; referenciaSIM-FFD88AB1-8C0B-4727-858D-3B57D2A6C44B; rechazado y aprobado;0 botonesnuevointento | Aprobada |
| E2E-13 | Descargar PDF comprador y abrir | ArchivoPDF descargado y legible | No ejecutada: la sesión expiró durante pausa y nuevo acceso falla por cuota de base de datos | Bloqueada |
| E2E-14 | Vendedor consulta pago y descarga mismoPDF | Solo lectura,misma referencia e importe | No ejecutada en estos fixtures por cuota de base de datos | Bloqueada |

## Evidencias y límites
[Resultados estructurados](resultados.json). [Acceso bloqueado](e2e-bloqueo-cuota.png). La captura e2e-negociacion.png muestra la preselección de una coincidencia; no usarla como prueba visual del lote de dos horas, pues el navegador capturó un fotograma anterior. El lote de dos horas fue confirmado por el resultado “2 negociaciones horarias registradas” y las dos filas de Transacciones.

## Continuación
Restablecer acceso al servicio de base de datos, iniciar sesión con cuentas de prueba nuevas o autorizadas, consultar el acuerdo confirmado de23-00, descargarPDF desde comprador y vendedor, abrir ambos y comparar referencia, importe exacto10046.2653625COP, fecha14/10/2026 y hora23-00(+1día). Verificar nuevamente saldo y persistencia después de recargar. Limpiar únicamente usuarios/filas del runId documentado, preservando trazas según política del proyecto. En aquella ejecución histórica pre-gate, una verificación rechazada no bloqueó negociación. La regla vigente exige aprobación actual para matching y trading; esos casos históricos no validan el comportamiento actual.

## Continuación en PostgreSQL local
Las descargas comprador/vendedor bloqueadas por cuota se ejecutaron con nuevos fixtures en una base local de pruebas el7/10/2026. Ver ../postgresql-local/README.md y PDFs conservados. Mantener los casos Neon como bloqueados históricamente; se validó el nuevo recorrido local.
