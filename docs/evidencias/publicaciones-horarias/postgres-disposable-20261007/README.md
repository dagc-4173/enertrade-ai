# Validacion PostgreSQL desechable del marketplace

## Vigencia frente a C4
Este dossier es evidencia histórica ligada al baseline `cd7e0d143215c3359a5cbe01b7ae3b0ca2c02304`, no una ejecución del HEAD `7a8d6f2` ni del harness C4 adaptado. Se conservan los resultados originales y las revalidaciones en sus estados registrados; HU-20 completo y navegador real siguen NOT_RUN. El informe JSON fue sanitizado solo en host/rutas/hash local de `.env`; ningún estado, fecha, caso, conteo o decisión histórica se cambió. La nueva ejecución aislada sigue pendiente.

El script HU-20 completo queda fuera del runner C4: requiere PreparedDataset IDs 17/18/33/49 con perfiles y rulesets 1.0.0 concretos, combina endpoints de pronóstico HU-06 y conserva un flujo marketplace histórico no portable. Su caso sigue `NOT_RUN`; no se sustituyó por una prueba de matching ni se inventó una fixture equivalente. La cobertura horaria/gate/pago del runner actual es una preparación para reejecución, todavía no un resultado.

El harness actual compara identidad de base habitual/desechable (host normalizado, puerto, base y usuario), exige `ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE=true`, loopback y nombre marcado, y limita reportes/credenciales a temp. La identidad habitual se lee solo para comparar; no se conecta. El hash de `backend/.env` no se exporta en informes futuros. `flows` y el script visual deben ejecutarse únicamente sobre un cluster desechable aislado y migrado de forma controlada; esta auditoría no ejecutó esos comandos.

Fecha: 7 de octubre de 2026. HEAD: cd7e0d143215c3359a5cbe01b7ae3b0ca2c02304. Sin staging ni commit. La validacion original no corrigio servicios; las dos correcciones y su revalidacion posterior se documentan al final.

## Entorno y seguridad

- Ejecucion: marketplace-integration-20261007-97411b659eac4573aeb22f5b348cba84.
- PostgreSQL 17.11 portatil oficial de EDB; host 127.0.0.1, puerto 55432.
- Base: enertrade_marketplace_test_20261007_97411b65; shadow: enertrade_marketplace_test_20261007_97411b65_shadow.
- Base habitual: Neon, neondb. Solo se leyo su configuracion local para comparar; no se abrio conexion con ella. No se incluyen passwords ni cookies en evidencia.
- Cluster nuevo en OS temp, autenticacion trust limitada a loopback, sin servicio Windows ni elevacion. Es exclusivamente de prueba; no reutilizar esa configuracion en produccion.
- Schema inicial comprobado con SQL: public sin tablas, ademas de pg_catalog, information_schema y pg_toast. Timestamp inicial: 2026-10-07T01:54:03.170283-05:00.
- pg_ctl.exe fue bloqueado por Control de aplicaciones; postgres.exe arranco directamente sin cambiar politicas. Las bases y sus directorios se conservan, no se ejecuta DROP DATABASE.
- Binario: https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip; SHA-256: 80379B2C04D51C30225532E0AE04509899141E9957ED096FE749D7FD9DF8F82F.

## Migraciones y drift

Se aplicaron primero las 16 migraciones baseline sobre la base vacia. Se insertaron usuarios, oferta, demanda y transaccion legacy de control antes de introducir las columnas horarias. Luego se desplegaron por separado y en orden las migraciones 20261007000000_hourly_publications, 20261007010000_publication_verification y 20261007020000_simulated_payments. Cada etapa comprobo _prisma_migrations, checksum SHA-256 del SQL, catalogo y valores legacy; no se infirieron horas ni cabeceras para registros legacy.

Prisma validate y generate 7.8.0 ejecutados. Las comparaciones Prisma-versus-real y migraciones-versus-real produjeron diff vacio. Esto no acredita por si solo las capacidades SQL que Prisma no representa: se compararon directamente los catalogos real y shadow, incluidos CHECK e indices parciales: 62 constraints, 72 indices, 199 columnas y 44 valores de enum, iguales. Se verificaron especificamente 15 CHECK, 10 FK restrictivas, seis indices unicos y dos parciales nuevos; nulabilidad y escalas Decimal(20,2)/Decimal(38,7) conservadas.

## Resultados de la validacion original

| Componente | Prueba | Esperado | Obtenido | Estado | Evidencia |
| --- | --- | --- | --- | --- | --- |
| Seguridad/entorno | Identidad SQL, separacion y schema vacio | Destino distinto y marcado | Loopback:55432; base test nueva; public vacio | PASSED | validation-results.json, target/runtime |
| Migraciones | Tres pasos separados, checksums y legacy | Aplicacion ordenada, valores legacy conservados | 17/18/19 migraciones; legacy intacto | PASSED | checkpoints.hourly/verification/payments |
| Drift | Prisma, migraciones y catalogos | Sin diferencias no explicadas | Diffs vacios y catalogos SQL iguales | PASSED | schema-vs-real.sql, migrations-vs-real.sql, shadowCatalogComparison |
| Constraints | Escrituras negativas reales con rollback | 23514/23503/23505 segun CHECK/FK/unique | PostgreSQL rechazo cada escritura invalida | PASSED | casos PG-CHECK/PG-FK/PG-UNIQUE |
| Indices parciales | Insertar segundo APPROVED/PENDING | Unique violation y rollback | 23505 para ambos indices | PASSED | PG-PARTIAL-ONE-APPROVED/PENDING |
| Horarios | hourly-integration.ts y limites adicionales | D+1..D+7; 0/23; rollback y unicidad | 10 casos del script; D+8/hour24 rechazados; centesimas exactas | PASSED | scriptOutputs, PG-HOURLY-BOUNDARIES |
| Verificacion | verification-integration.ts y flujo offer/demand | Versiones, snapshots y limites informativos | Nueve casos; NO_REFERENCE/APPROVED/REJECTED/OUTDATED; matching no bloqueado | PASSED | scriptOutputs, PG-VERIFY-OFFER-DEMAND |
| Matching/HU-20 | v2, hora, exclusion y replay | Decision reproducible sin PII de usuario | participantKey conserva igualdad; replay identico | PASSED | PG-MATCHING-REPLAY |
| Negociacion | Lote, reservas, contrapropuesta y aceptacion | Hora y batchId internos; importe exacto | CONFIRMED, dos revisiones, total exacto | PASSED | PG-NEGOTIATION-BATCH |
| Cierre/aislamiento | Cerrar fixture con controles externos vencidos | Solo pendientes fixture cancelados | Confirmadas y controles intactos, reserva liberada | PASSED | PG-HOURLY-CLOSURE, controles |
| Concurrencia A | Dos propuestas sobre capacidad 10 | Un ganador sin sobreasignacion | HTTP 201/409; reserva 8 | PASSED | PG-CONCURRENCY-A |
| Concurrencia B | Pendientes SQL incompatibles 7+7 sobre capacidad 10 | No confirmar cantidad mayor que capacidad | Un conflicto P2034/40001; al reintentar se confirmaron 14 | FAILED | PG-CONCURRENCY-B, incompatibleAcceptance |
| Concurrencia C | Dos lotes multihora y lote parcialmente invalido | Ganador atomico y rollback del perdedor | HTTP 201/409; dos filas de un batch; fallo previo dejo cero filas | PASSED | PG-CONCURRENCY-C |
| Concurrencia D | Mismo transactionId/requestKey | Un intento y replay seguro | HTTP 201/409; replay 200; un registro | PASSED | PG-CONCURRENCY-D |
| Concurrencia E | Dos APPROVED con claves distintas | Un aprobado | HTTP 201/409; un aprobado persistido | PASSED | PG-CONCURRENCY-E |
| Pagos | payment-integration.ts, resolucion e importe | Roles, estados, idempotencia, comprobante y simulacion | Nueve casos; finales inmutables y acuerdo CONFIRMED | PASSED | scriptOutputs, PG-PENDING-RESOLUTION |
| Guard navegador | Habitual, permiso ausente y nombre no marcado | Rechazar las tres configuraciones sin conectar | Las dos primeras rechazadas; nombre unmarked_database aceptado | FAILED | PG-BROWSER-GUARDS |
| Lifecycle navegador | Funcion con PostgreSQL y archivo temporal, sin navegador | Cleanup en exito y excepcion | Dos archivos creados/eliminados; conteos restaurados | PASSED | PG-BROWSER-LIFECYCLE |
| Cleanup | Fixtures marcados y controles separados | Cero residuos de ejecucion, controles intactos | Solo dos usuarios y filas de control permanecen; cero archivos con credenciales | PASSED | PG-FINAL-CLEANUP, finalCounts |
| HU-06/V5 | Hashes antes/despues | Archivos protegidos sin cambios | 110 hashes iguales, incluido predictions.jsonl | PASSED | protectedBefore/After, journalProtected |
| HU-20 completo | Script que tambien ejecuta pronosticos HU-06 | Respetar exclusion HU-06 | No ejecutado; flujo marketplace equivalente cubierto | NOT_RUN | PG-HU20-FULL-SCRIPT |
| Navegador real | browser-flow-fixture.ts como programa/navegador | No ejecutarlo en esta fase | No iniciado; solo funcion lifecycle invocada | NOT_RUN | PG-BROWSER-REAL |

Resumen de comprobaciones unicas del arnes: 51 PASSED, 2 FAILED, 0 BLOCKED, 2 NOT_RUN. Los tres scripts aportan 10/9/9 casos; no se suman reruns ni se convierten NOT_RUN a PASSED.

## Hallazgos originales

1. energy-transaction.service.ts accept no revalida capacidad ante pendientes incompatibles preparados por SQL. La API de propuestas si impidio sobre-reserva en A/C; esta precondicion no se genero por API. Se requiere defensa al confirmar para estados legacy/importados/inconsistentes, incluyendo reintento tras P2034/40001.
2. integration-safety.ts comprueba separacion y bandera disposable pero no exige nombre test/disposable. La prueba negativa fue solamente de configuracion: nunca conecto a un destino no autorizado. El arnes de esta ejecucion tiene una comprobacion mas estricta y todas las escrituras se limitaron al destino registrado.

Incidencias del arnes conservadas como resueltas en JSON: inet_server_addr::text devuelve /32, corregido usando host(); actor de sesion fuera del contrato de 43 caracteres, corregido con randomBytes(32).toString('base64url'). Ambas etapas se repitieron y limpiaron fixtures. Se observo una advertencia de pg sobre query concurrente dentro del adapter Prisma; no se oculto ni se atribuyo por si sola a un fallo de datos.

## Reproduccion y evidencia

Arnes: backend/scripts/marketplace-postgres-validation.ts. Modes bootstrap, catalog hourly/verification/payments, prepare, scripts, flows, boundaries, finish. La secuencia debe ejecutarse solo despues de configurar una base nueva, marcada y separada y preparar las migraciones por etapas; bootstrap no reutiliza controles existentes. El arnes fuerza loopback:55432, verifica identidad SQL y no carga la URL habitual como conexion.

validation-results.json conserva IDs, precondiciones, esperado/obtenido, errores reales, catalogos, conteos, hashes y eventos HTTP. No contiene passwords de Neon, cookies ni credenciales temporales del navegador. Los cuatro campos `passwordHash` de controles antiguos contienen solo el literal deshabilitado `disabled-validation-control`, no hashes de credenciales válidas. El hash de `backend/.env` está redactado; los hashes restantes corresponden a archivos académicos protegidos o al checksum público del binario de PostgreSQL. El arnes devuelve codigo 1 para la decision de esta ejecucion. Conservar esta evidencia para TG-II (HU-21/22, HU-10/11, C21, HU-20); no acredita despliegue ni validacion academica.

## Cierre de instancia

Despues de guardar la evidencia se envio Ctrl+C al postgres.exe propio. postgres-server.log conserva el cierre rapido, checkpoint completo y database system is shut down. Se verifico ausencia de listener en 55432 y presencia de data/PG_VERSION; no se eliminaron la base test, la shadow ni los controles externos. La configuracion habitual y los archivos HU-06/V5 conservaron sus hashes. Backend typecheck y revision de whitespace del informe pasaron; git diff --check devolvio 0. No se ejecuto git add ni commit.

Decision original: CONCURRENCY_PROBLEM. Se conserva la tabla y los registros originales FAILED como evidencia historica, no como resultado de la revalidacion siguiente.

## Correccion y revalidacion de los dos fallos

Solo se corrigieron energy-transaction.service.ts e integration-safety.ts, con sus pruebas y el modo revalidate del arnes existente. No se cambiaron schema ni migraciones. El fixture navegador estaba abierto en el editor pero ausente en disco; el estudiante autorizo guardar su contenido actual sin modificarlo ni ejecutarlo. Durante ese guardado se produjo una duplicacion accidental, retirada antes de continuar; typecheck volvio a pasar.

### Causa raiz y solucion

CONCURRENCY-B: accept confirmaba sin comprobar capacidad dentro de withLockedTransaction. El lock existente cubre EnergyTransaction por id, luego EnergyOffer y EnergyDemand de la operacion; las publicaciones constituyen las filas compartidas de capacidad. Se conserva aislamiento Serializable y no se agrega mutex global ni nueva estructura. Antes del write CONFIRMED, el callback relee oferta/demanda, agrega cantidades CONFIRMED ajenas excluyendo id propio y compara agregado + cantidad propia con ambas capacidades vigentes usando Prisma.Decimal. Las otras pendientes no son compromisos confirmados: en el caso importado 7+7, una puede ganar y la otra queda pendiente sin cambios. Las consultas sin exclusion siguen incluyendo la fila confirmada para calcular FULFILLED. Cada retry vuelve a invocar accept y ejecuta todas las lecturas y la validacion; no se eliminan retries ni se conserva un chequeo previo.

BROWSER-GUARD: la bandera y la separacion no bastaban para identificar una base desechable. El guard ahora exige host localhost/127.0.0.1/[::1], bandera true, nombre diferente del habitual y token completo test/testing/disposable delimitado por inicio/fin, underscore o guion. Rechaza nombres normales, contest, testament, tested y testingground; tambien destinos remotos y overrides de routing. Una configuracion rechazada no cambia DATABASE_URL y no conecta.

### Gate sin PostgreSQL

```text
cd backend
bun test src/tests/publication-expiration.test.ts src/tests/energy-transaction.test.ts src/tests/energy-marketplace.test.ts
bun run typecheck
git diff --check
```

110 pruebas aprobadas en tres archivos, cero fallos; typecheck y diff check aprobados antes de arrancar PostgreSQL. Nuevos casos de capacidad CAP-A, CAP-B/E, CAP-C oferta/demanda, CAP-D retry y CAP-F centesimas en limite Decimal(20,2). Guard: seis nombres positivos probados con los tres hosts loopback y 12 configuraciones negativas. No se uso PostgreSQL durante este gate.

### PostgreSQL conservado, sin migraciones

Se verificaron marca/nombre exacto, separacion de Neon, directorio PG17 retenido y puerto 55432 libre. Se arranco directamente postgres.exe sobre el mismo data y solo loopback. El arnes verifico identidad SQL, 19 migraciones terminadas con sus checksums y constraints/indices iguales al checkpoint anterior antes de escribir fixtures. No se reaplicaron migraciones ni se genero otra base.

```text
bun scripts/marketplace-postgres-validation.ts revalidate
```

Ejecucion registrada: capacity-fix-647f5bc8-b439-4cbc-b34a-f9407faf36c1, 2026-10-07T15:32:53.944Z a 2026-10-07T15:32:54.680Z. Concurrencia B se repitio diez veces, sin omitir resultados. En cada iteracion: dos pendientes SQL de 7 sobre capacidad 10, exactamente un ganador, CONFIRMED total 7, un perdedor con OFFER_CONFIRMATION_CAPACITY_EXCEEDED (409), fila perdedora identica al snapshot y rechazo identico ante otro retry. Se observaron diez P2034/SQLSTATE 40001 iniciales; se reintento el metodo completo. El arnes conserva por intento los codigos realmente observados, no inventa errores.

| Componente | Prueba | Esperado | Obtenido | Estado | Evidencia |
| --- | --- | --- | --- | --- | --- |
| Concurrencia B | Diez carreras y retries | Un ganador, total <=10, sin cambio parcial | 10/10, total 7, perdedor 409 intacto | PASSED | revalidations.iterations/errorsObserved |
| Capacidad exacta | Confirmado 3 + pendiente 7 | Confirmar hasta 10, propia fila una vez | Total 10 | PASSED | capacityRegressions.B/E-exact |
| Capacidad oferta/demanda | 3 + 7.01 | Rechazar por la capacidad limitante | Dos codigos de dominio, total previo 3 | PASSED | capacityRegressions.C-offer/C-demand |
| Decimal grande | .98 + .01/.02 en limite 999999999999999999.99 | Igualdad permitida; exceso .01 rechazado | Valor exacto; fila rechazada intacta | PASSED | capacityRegressions.F-exact/F-exceeds |
| Guard | Diez negativos y cinco positivos | Rechazar todos los inseguros antes de conectar | 10 rechazados, 5 aceptados, cero conexiones no autorizadas | PASSED | revalidations.guard |
| Cleanup | Solo usuarios/filas de revalidacion | Restaurar conteos y controles | Conteos originales, cero usuarios nuevos y hashes protegidos iguales | PASSED | PG-REVALIDATION-CLEANUP |
| HU-20 completo | No ejecutarlo | Mantener NOT_RUN | No ejecutado | NOT_RUN | PG-HU20-FULL-SCRIPT |
| Navegador real | No ejecutarlo | Mantener NOT_RUN | No ejecutado | NOT_RUN | PG-BROWSER-REAL |

Resumen vigente por ID unico: 55 PASSED, 0 FAILED, 0 BLOCKED, 2 NOT_RUN. Se anexaron resultados nuevos bajo los mismos IDs de los defectos; los FAILED originales permanecen en cases y previousSummary/previousDecision dentro de revalidations. No se reejecutaron los scripts horarios/verificacion/pagos, ni A/C/D/E, ni el navegador real/HU-20 completo. La advertencia existente del adapter pg volvio a observarse; no implico resultados intermitentes ni cambios parciales.

Tras guardar el JSON actualizado se detuvo limpiamente la misma instancia con Ctrl+C; el nuevo tramo de postgres-server.log conserva checkpoint y database system is shut down. Puerto 55432 sin listener, data/PG_VERSION retenido, bases/control externo conservados y 110 hashes protegidos iguales. No se hizo staging ni commit; las variables de conexion de la prueba se retiraron del shell al cierre.

READY_FOR_COMMIT_PLAN