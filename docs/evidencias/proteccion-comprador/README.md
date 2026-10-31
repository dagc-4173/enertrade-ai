# Protección del comprador ante entregas incompletas

Fecha de ejecución: 2026-10-31 (Colombia). Estado: implementado y probado en desarrollo y PostgreSQL local aislado; migración aplicada en la base habitual; aceptación funcional de interfaz y actualización de imágenes pendientes de confirmar.

## Trazabilidad y alcance

Refinamiento solicitado por el estudiante a partir de una observación del asesor. Requisito nuevo propuesto REQ-SIM-DEL-01: retener el importe simulado y liquidar según entrega aceptada. Relación contextual con HU-10/HU-11 de emparejamiento y su trazabilidad; no se renumeran HU heredadas, no se declara esta ampliación como criterio original ni se inventan sprint, fechas de aprobación o story points. Pendiente incorporación formal al backlog con el estudiante.

Backend: esquema/migración SimulatedSettlement; servicios simulated-payment v2 y simulated-settlement; rutas /simulated-settlements. Frontend: SettlementPanel, SimulatedPaymentPanel, Transacciones y Administración. ADR-39 documenta la decisión.

## Casos y resultados ejecutados

Precondición: acuerdo CONFIRMED entre dos cuentas distintas, nuevo intento aprobado internal-simulator v2, fecha/hora terminada en Colombia. Base aislada con fixture temporal; sin dinero real.

| ID | Pasos / resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|
| SET-01 | Declarar y aceptar 0, 8.000 y 10.000 sobre 10.000 kWh a 500 COP; pago + devolución = 5.000.000 | Coincide en los tres casos; segunda solicitud con misma clave no agrega evento | Probado |
| SET-02 | Disputar con y sin declaración; resolver por admin ajeno | Retención sin liquidar hasta resolución; comprador y admin participante rechazados | Probado |
| SET-03 | Cuenta ajena/bloqueada, periodo futuro, pago histórico y alcance aislado | Rechazos 404/403/409 según caso; v1 no se altera | Probado |
| SET-04 | Exceso, aceptar sin declaración, resolver sin disputa | Se rechazan transiciones inválidas | Probado |
| SET-05 | Decimales, campos extra y fin de hora Colombia | Cálculo exacto hasta siete decimales; cantidades inválidas rechazadas | Probado |
| SET-HTTP | Sin sesión, origen distinto y JSON roto | 401, 403 y 400; respuesta sin identidad privada de las partes | Probado |
| SET-PG | Migrar base vacía; pagos reales del simulador; aceptar concurrentemente; dos admins resuelven a la vez | 24 migraciones aplicadas; cuatro acuerdos; una sola liquidación por acuerdo; autenticación HTTP por cookie válida | Probado |
| SET-UI-01/05 | Roles, devolución, contenido escapado, contrato y cookies | Cinco pruebas pasan | Probado |
| SET-VIS | Abrir vista temporal rotulada, aceptar entrega parcial, revisar resultado | Pago 4.000.000 y devolución 1.000.000 visibles; captura entrega-parcial.png | Revisado visualmente |

Suite backend relevante: 68 pruebas, 0 fallos, 289 aserciones (4 archivos). Suite frontend completa: 285 pruebas, 0 fallos, 1278 aserciones (34 archivos). Compilación frontend, lint, typecheck backend y prisma validate aprobados. Los logs finales se conservan junto a este archivo.

La captura es una vista aislada con componentes reales y respuestas de ejemplo para revisión visual; no demuestra custodia ni medición, ni sustituye la prueba PostgreSQL. La integración PostgreSQL usa servicio/ORM/controlador reales y fixture propio, no datos de usuarios habituales. El script elimina sus filas al finalizar.

## Uso tras desplegar

Transacciones → Ver negociación → Ver pago simulado. Solo nuevos pagos aprobados v2 muestran Entrega y protección del comprador. El vendedor declara la energía y referencia. El comprador acepta o disputa. Administración muestra hasta 100 disputas abiertas (las más antiguas); solo un administrador no participante puede resolver indicando cantidad y motivo. Actualizar entrega refresca cambios de la contraparte.

La fecha/hora debe terminar primero; acuerdos sin hora se habilitan al finalizar el día de Colombia. Si no hay declaración, el comprador puede disputar después del periodo. No hay liberación automática por silencio ni plazo automático de resolución. No se admiten penalizaciones, intereses o compensación por energía de reemplazo. La energía no entregada no se vuelve a publicar automáticamente.

La evidencia es texto de referencia, no archivo verificado; no se adjuntan ni descargan documentos externos. XM agregado no acredita una entrega individual. Sin administrador independiente la disputa seguirá retenida. El historial conserva actor interno/rol, instante, solicitud y decisión; la API pública no entrega identidad interna ni clave de repetición. No es auditoría externa inalterable.

## Activación pendiente

Conservar .env.deploy y correcciones locales de modelos. Publicar el commit por decisión del estudiante. Actualizar fuente y ejecutar en el entorno elegido:

```bash
docker compose --env-file .env.deploy build app
docker compose --env-file .env.deploy run --rm migrate
docker compose --env-file .env.deploy up -d app
```

En Azure anteponer sudo si corresponde. La migración es aditiva y no transforma pagos históricos. No basta con up sin reconstruir. La base habitual es compartida: coordinar la activación de imagen y migración. Probar con cuentas controladas, sin borrar acuerdos habituales.

## Uso de IA

ChatGPT/Codex apoyó diseño, implementación, pruebas y documentación. Verificación mediante pruebas automatizadas, PostgreSQL real aislado y revisión visual. Revisión del estudiante y aceptación desplegada pendientes.


## Incidencia y corrección en la base habitual

El estudiante reportó error al consultar entrega de un nuevo pago v2. Prisma migrate status confirmó únicamente la migración 20261031000100_simulated_settlement pendiente. Se ejecutó migrate deploy: aplicada correctamente; estado final actualizado con 24 migraciones. Lectura del servicio sobre la referencia de la captura ab6c9b3e: HELD, 15.000 kWh, importe reservado 8.250.000 COP, deliveryEnded=false. No se registraron entregas ni liquidaciones durante esta comprobación. La entrega corresponde al 01/11/2026 de 11:00 a 12:00; las acciones se habilitan al finalizar ese periodo en Colombia. Confirmación visual del estudiante pendiente.


## Confirmación del estudiante

El 31/10/2026 el estudiante informó haber confirmado el flujo usando transacciones anteriores, cuyo periodo ya había terminado. Es una confirmación manual reportada por el estudiante; no se conserva aquí una captura de liquidación de esos acuerdos ni se afirma una revisión independiente de sus importes. Solicitó a continuación commit y actualización de Azure y Docker local. La restricción para periodos futuros se mantuvo.
