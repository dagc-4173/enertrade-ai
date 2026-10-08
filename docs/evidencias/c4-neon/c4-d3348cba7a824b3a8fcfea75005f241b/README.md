# Validación C4 en Neon disposable

Fecha: 8 de octubre de 2026. Run: `c4-d3348cba7a824b3a8fcfea75005f241b`. Baseline: `7a8d6f2202ff619cc6706da1b5358b64a4bbdf5a`.

## Entorno

- Proveedor: Neon. Branch indicada al ejecutar: `c4-validation-disposable`; no se consultó el plano de control para verificar el nombre de branch.
- Principal: `enertrade_c4_test`. Shadow: `enertrade_c4_shadow_test`.
- Las identidades y el guard se validaron contra `backend/.env` sin conectar a la base habitual. El host y las conexiones se omitieron del artefacto.
- Ambas bases comenzaron con cero tablas públicas y cero migraciones. `backend/.env` no fue modificado.

## Migraciones y etapas

Se aplicó `prisma migrate deploy` a cada base disposable antes del modo `bootstrap`; ambos comandos aplicaron las 19 migraciones versionadas. Después se ejecutaron, en orden, `bootstrap`, `catalog hourly`, `catalog verification`, `catalog payments`, `prepare`, `scripts`, `flows`, `boundaries` y `finish`.

Los tres checkpoints de catálogo observaron el esquema ya migrado completo; no representan una aplicación escalonada de M1/M2/M3. `schema-vs-real.sql` y `migrations-vs-real.sql` son diffs de Prisma generados en modo lectura. Principal y shadow coincidieron en 206 constraints, 72 índices, 199 columnas y 44 enums. En el chequeo final, principal conservaba 19 registros de migración; shadow tenía 19 tablas de aplicación con cero filas, pero ya no contenía la tabla `_prisma_migrations`.

### Clasificación del historial shadow
Clasificación **A: efecto intencional de Prisma Migrate Diff**. Antes de generar el diff, ambas bases tenían 19 registros finalizados en `_prisma_migrations`. La comparación `migrate diff --from-migrations ... --to-config-datasource` usó la shadow para reconstruir/reproducir el esquema desde los SQL versionados. Después, la shadow conservó el catálogo de aplicación (206 constraints, 72 índices, 199 columnas y 44 enums) y cero filas, pero no su ledger `_prisma_migrations`; `migrations-vs-real.sql` contiene `-- This is an empty migration.`. Esa comparación valida equivalencia de catálogo; no se interpreta como historial final de deploy en shadow ni como alteración de la base habitual.

## Resultados

Resumen vigente por IDs de caso: **55 PASSED, 0 FAILED, 0 BLOCKED, 1 NOT_RUN**. El único `NOT_RUN` es HU-20 completo, excluido por datasets fijos/mezcla con HU-06. Las ejecuciones iniciales fallidas se conservan en `validation-results.json`; sus reruns exitosos no alteran esos registros.

**Validación funcional: PASSED** con el resumen anterior. **Validación global C4: FAILED** porque `localSessionRemovalVerified=false`. En el JSON, `decision: READY_FOR_COMMIT_PLAN` es la decisión interna del harness por casos de integración y no reemplaza el estado global.

Runners actuales: hourly 10 casos, verificación 9, gate 8 y pagos/notificación 12; cleanup de cada script confirmado en el rerun final. `flows` y `boundaries` pasaron tras corregir el filtro DateTime y esperar el SQLSTATE real `23001` de `ON DELETE RESTRICT`. `finish` confirmó catálogos, controles y cleanup.

Pruebas unitarias: 49 aprobadas, 0 fallidas, 191 expectativas. Typecheck y `git diff --check`: aprobados.

Browser integrado: login sintético, aviso de transacción por pagar y navegación a Transacciones aprobados. Captura: [payment-notice.png](payment-notice.png). El navegador incluido de Playwright no tenía Chromium; Edge/Chrome en modo headless expiró al iniciar. La validación visual se completó en el navegador integrado.

## Cleanup y límites

El runner browser terminó antes de ejecutar `finally`. Se retiraron manualmente, con IDs exactos y scope de fixture, sus dos cuentas sintéticas, publicaciones, transacción, sesiones y archivos TEMP. También se retiraron 24 trazas `system` creadas por la UI después de `finish`; el informe conserva el evento de cleanup manual. El usuario de la sesión fue eliminado y el backend ya no acepta su cookie. Se intentó expirar la cookie HTTP-only mediante `Set-Cookie`, pero el navegador integrado abortó la navegación 204 y no se pudo verificar la eliminación local de esa cookie: la limpieza del perfil del navegador queda parcial/no verificada. El API, Vite y relay loopback se detuvieron. Una segunda limpieza quitó los dos controles bootstrap restantes: las tablas de aplicación en principal quedaron en cero; las 19 migraciones se conservaron. Shadow conserva su esquema migrado y cero filas de aplicación.

El usuario confirmó la eliminación manual de la branch Neon `c4-validation-disposable`; el campo `branchCleanup.deleted` quedó en `true`. La confirmación es del usuario, no una lectura independiente del plano de control. Esto no modifica el estado de cleanup de cookie: la eliminación local de la cookie del navegador sigue sin verificarse. HU-20 no se ejecutó. El histórico de `55 PASSED / 2 NOT_RUN` en `postgres-disposable-20261007` pertenece a otro baseline y no se reutiliza como resultado de este run, aunque coincida el conteo PASSED antes del browser actual.

## Artefactos

- `validation-results.json`: casos, estados, migraciones, checkpoints y cleanup del run, sanitizado.
- `schema-vs-real.sql` y `migrations-vs-real.sql`: comparación de drift.
- `payment-notice.png`: captura nueva del navegador integrado.
