# Evidencia técnica — Administración

Fecha local de ejecución: 21 de octubre de 2026. Entorno: aplicación local y PostgreSQL configurado por el proyecto. Estado: implementado y probado técnicamente; pendiente aceptación del estudiante, validación académica y despliegue.

## Alcance y trazabilidad

Contribuye a HU13 (indicadores restringidos) y HU19 (histórico técnico y permisos), sin declarar completas todas sus condiciones académicas. La gestión de cuentas corresponde a la ampliación autorizada por el estudiante en TG-II. Decisión: ADR-33. No se asignan sprint/story points sin refinamiento del backlog. La evidencia debe conservarse junto con el commit que el estudiante realice manualmente.

## Resultados ejecutados

- Backend: 350 pruebas aprobadas, 0 fallos, en 15 archivos ejecutados en procesos separados. El aislamiento evita contaminación entre `mock.module` de fixtures heredados. Detalle: `backend-resumen.txt` y logs individuales.
- PostgreSQL real: 5 pruebas aprobadas, 0 fallos, 27 aserciones. Se aplicaron las 20 migraciones en un esquema temporal exclusivo. Se verificó que no quedaron esquemas `admin_test_*`. Detalle: `backend-db.txt`.
- Frontend: 250 pruebas aprobadas, 0 fallos, 1101 aserciones, 27 archivos. Detalle: `frontend-tests.txt`.
- Total backend incluyendo PostgreSQL: 355 pruebas aprobadas. Total frontend: 250.
- Tipos backend, compilación de producción frontend, ESLint y `git diff --check`: aprobados. Logs adjuntos cuando aplica.
- Migración administrativa aplicada en el esquema normal. Cuenta inicial registrada por el estudiante y promovida mediante comando local; contraseña elegida por el estudiante, no capturada ni incluida en evidencias. Se verificó ADMIN/ACTIVE.
- En navegador se verificó inicio de sesión, menú administrativo, acceso a Inicio, listado real de cuentas y filtros disponibles. No se bloquearon cuentas reales para obtener evidencia: las mutaciones de prueba se ejecutaron en el esquema temporal.

## Casos administrativos

| ID | Relación | Precondición y pasos | Esperado | Obtenido / estado | Evidencia |
|---|---|---|---|---|---|
| ADM-01 | HU13/HU19 + ampliación | Sesión USER, ADMIN bloqueado, ADMIN activo o rol ausente; solicitar recurso protegido | Solo ADMIN activo accede | 403/200 según rol; aprobado | backend-admin-access.txt |
| ADM-02 | HU13/HU19 | USER invoca cuentas, auditoría, sync, importación, datasets, indicadores e histórico | Denegación en servidor antes de operar | 403; aprobado | backend-admin-access.txt |
| ADM-03 | Ampliación | Mutación con origen cruzado | Rechazo previo a escritura | 403; aprobado | backend-admin-access.txt |
| ADM-04/DB-02 | Ampliación | Degradar o bloquear último administrador; dos administradores intentan degradarse entre sí | Permanece administrador activo | Un cambio concurrente aprobado y uno rechazado; aprobado | backend-db.txt |
| ADM-05/07 | Ampliación | Enviar campos ajenos, roles inválidos, motivo insuficiente o rol en registro público | Rechazo sin escalación de privilegios | Aprobado | backend-admin-access.txt |
| ADM-06/DB-01 | Ampliación | Cuenta bloqueada con sesión y publicaciones/negociaciones temporales | Revocación y cancelación atómica; acuerdos confirmados preservados | Aprobado | backend-db.txt |
| ADM-DB-03 | Ampliación | Inyectar fallo al registrar auditoría | Revertir cuenta, sesiones y efectos | Aprobado | backend-db.txt |
| ADM-DB-04 | Ampliación | Intentar autobloqueo y revisar respuesta segura | Rechazar cambio propio; no devolver hash | Aprobado | backend-db.txt |
| ADM-DB-05 | Ampliación | HTTP con administrador sobre esquema temporal; buscar, cambiar rol y consultar auditoría | Perfiles seguros y cambio auditado | Aprobado | backend-db.txt |
| ADM-UI-01..04 | HU13/HU19 + ampliación | Renderizar USER/ADMIN y parsear contratos válidos e inválidos | Ocultar acceso normal; mostrar controles a ADMIN; rechazar contratos corruptos | Aprobado | frontend-tests.txt |

## Reproducción

Desde backend: `bun test src/tests/admin-access.test.ts` y `bun run typecheck`. Para pruebas reales optativas: en PowerShell establecer `$env:ADMIN_DB_TEST='1'` y ejecutar `bun test src/tests/admin-database.test.ts`; después quitar la variable con `Remove-Item Env:ADMIN_DB_TEST`. Las pruebas crean y eliminan únicamente su esquema temporal de nombre generado y validado.

Desde frontend: `bun test tests`, `bun run build`, `bun run lint`.

## Límites y pendientes

No se ejecutó toda la batería ML ni una nueva evaluación de exactitud predictiva: el cambio trata de permisos/administración. No se generaron datasets nuevos mediante la interfaz durante esta verificación para evitar modificar series operativas sin necesidad. El flujo de preparación existente tiene regresión ejecutada; la sincronización depende de XM. Las migraciones y el alta inicial sí se ejecutaron sobre el entorno configurado.

No se ha realizado commit ni push. Validar manualmente la aceptación del flujo administrativo con el estudiante. Mantener originales de capturas en privado y anonimizar correos antes de incluirlos en una entrega pública. Uso de IA: apoyo de ChatGPT/Codex en diseño, implementación y pruebas; requiere revisión y comprensión del estudiante.
