# PostgreSQL local para EnerTrade

Configurado el 7 de octubre de 2026. PostgreSQL 17.11 oficial EDB, puerto 55433, escucha exclusivamente 127.0.0.1, autenticación SCRAM-SHA-256. Archivos persistentes en `%LOCALAPPDATA%\EnerTrade\PostgreSQL17`, fuera de Temp y del repositorio. Carpeta restringida al usuario Windows y SYSTEM. El usuario de aplicación enertrade_app no es superusuario ni puede crear roles/bases.

## Bases y datos
- `enertrade_dev`: desarrollo habitual, configuración backend/.env (ignorada por Git).
- `enertrade_integration_test`: pruebas desechables autorizadas; separada de desarrollo. Los scripts de integración existentes comprueban el destino.
- Las 19 migraciones existentes se aplicaron a ambas bases. No se cambió el modelo ni se reinició una base existente.
- Neon no se eliminó ni se restauró sobre PostgreSQL local. El 7 de octubre se hizo una exportación lógica de solo lectura; su respaldo privado permanece fuera del repositorio bajo `%LOCALAPPDATA%\EnerTrade\PostgreSQL17\backups`. No se ha probado su restauración. La configuración previa (`neon-env.backup`) y `secrets.json` contienen credenciales: no leerlos para documentación ni adjuntarlos/subirlos a Git.
- Los usuarios, publicaciones y transacciones de Neon no están en la base local. Crear una cuenta nueva desde la aplicación. La carga automática XM del backend puede crear datasets nuevos; no son una restauración de datos previos.

## Uso
La aplicación habitual sigue en http://localhost:5173 y backend en http://localhost:3000. La base queda ejecutándose en segundo plano, sin instalar servicio Windows. Después de reiniciar el equipo:

```powershell
# Desde la raíz del repositorio
Push-Location backend
.\scripts\start-local-backend.ps1
Pop-Location
# Desde otra terminal, cambiar al directorio frontend del repositorio
bun run dev
```

Para iniciar únicamente la base: `backend/scripts/start-local-database.ps1`. No se inicia automáticamente con Windows. No borrar la carpeta data; contiene los registros persistentes. Reiniciar PostgreSQL requiere detener/iniciar su instancia propia con administración PostgreSQL; no eliminar archivos ni reutilizar directorios temporales de integración.

### Arranque controlado sin sincronización XM automática

Para desarrollo/diagnóstico, definir `XM_AUTO_SYNC_ENABLED=false` en el entorno antes de iniciar el backend evita la sincronización XM al arrancar y su programación diaria. En PowerShell: `$env:XM_AUTO_SYNC_ENABLED = 'false'`. El servidor continúa arrancando y registra que solo el scheduler automático está deshabilitado: XM y los endpoints manuales de sincronización siguen habilitados. Esta opción no convierte el backend en solo lectura ni bloquea otras escrituras. Sin la variable, con `true` o con cualquier valor distinto de la cadena exacta `false`, el comportamiento automático sigue habilitado. Para recuperar el valor por defecto en esa terminal: `Remove-Item Env:XM_AUTO_SYNC_ENABLED`.

## Recuperación de Neon
Existe una exportación lógica de solo lectura documentada en `docs/evidencias/neon-ahorro/`; no es un `pg_dump` nativo y su restauración no se ha probado. Neon sigue siendo el servicio cloud previsto cuando está disponible; PostgreSQL local es un fallback temporal para desarrollo/pruebas, no un destino productivo ni una arquitectura permanente. Si se restaura el respaldo, hacerlo en una base local nueva y separada, verificar versión/schema, constraints y conteos, y conciliar datos antes de decidir cualquier actualización de `enertrade_dev`. No restaurar encima de datos nuevos sin plan de conciliación.

## Verificación
GET /health devuelve status ok y database ok. Migraciones al día. 28 casos de integración (10 publicaciones, 9 verificación, 9 pagos) aprobados en la base test, con limpieza de fixtures. Flujo real de navegador local hasta dos descargas PDF documentado en ../evidencias/postgresql-local/README.md. No se afirma validación de todos los módulos ML ni despliegue público.
