# Seguimiento de pronósticos en Patrones

Fecha: 2026-10-30 (Colombia). Estado: implementado y probado en local; migración aplicada en la base habitual de Neon y backend local actualizado. La imagen de Azure sigue pendiente de actualización. Durante la validación inicial aislada no se utilizó la base habitual; en la activación posterior se creó la tabla nueva y se comprobó un pronóstico real futuro.

## Corrección de activación local

Se detectó backend antiguo sin la ruta (404). Se aplicó 20261030000100_forecast_history en Neon y se reinició el backend local del puerto 3000 con XM_AUTO_SYNC_ENABLED=false. Se corrigió también credentials: include en listado, detalle y evaluación del historial y en los POST autenticados de oferta, demanda diaria y B1. Sin esa opción el navegador no enviaba sesión entre localhost:5173 y localhost:3000; se agregaron pruebas de regresión HIST-UI-05 y de pronósticos autenticados.

Validación mediante la sesión existente en el navegador: historial consultado sin errores, generación real Ridge de oferta para 2026-10-31, origen 2026-10-27, h4, aviso de guardado y registro visible en Patrones con estado Pendiente. No se evaluó anticipadamente ni se fabricaron observaciones. La captura historial-local-corregido.png corresponde a esta comprobación real; las anteriores siguen siendo fixtures visuales.

## Alcance

Requisito autorizado por el estudiante: registrar nuevas predicciones por usuario y consultarlas en Patrones, con evaluación manual posterior. Relación con HU05/HU07/HU08/HU17 y navegación de HU12/HU13; sin asignar una HU, sprint o story points nuevos no aprobados. Decisión: ADR-38. El análisis descriptivo de patrones permanece como sección separada.

### Uso

1. Iniciar sesión y generar una predicción futura. La respuesta informa si se guardó.
2. Abrir Patrones → Seguimiento de pronósticos.
3. Filtrar por fecha objetivo, variable, modelo o estado; abrir Ver detalle.
4. Cuando termine el día objetivo, pulsar Evaluar con datos XM. Si XM no publica un día completo, el registro permanece pendiente.
5. Una evaluación completa muestra gráfica real/pronóstico, tabla por periodo, MAE, RMSE, WAPE y sesgo de esa ejecución.

Se registran Ridge oferta, demanda horaria y diaria, Ridge precio, B1, Chronos-2 y Bolt para las tres variables horarias. Once combinaciones en total. Predicciones históricas anteriores a este incremento no se importan ni se reconstruyen. No se ejecutó entrenamiento ni un nuevo benchmark ML.

## Pruebas y evidencia

| ID | Relación | Precondición / pasos | Esperado | Obtenido | Estado |
| --- | --- | --- | --- | --- | --- |
| HIST-01 | HU05/HU07/HU08, refinamiento | Resultados controlados de once combinaciones | Normalizar fecha, variable, fuente, unidad, horizonte y valores; rechazar corruptos | Coincide | Aprobado |
| HIST-02/06/08 | HU17, refinamiento | Dos propietarios; consultar/listar/evaluar y alterar filtros/origen/cuerpo | No revelar otro usuario; filtros acotados; 401/403/404 según corresponda | Coincide | Aprobado |
| HIST-03/04 | HU05/HU07/HU08 | Reloj controlado y proveedor simulado | Futuro no consulta; ausencia queda pendiente; errores de pares y cero real correctos | Coincide | Aprobado |
| HIST-05 | HU17 | Reordenar claves JSON y alterar valor guardado | Aceptar reordenación JSONB; rechazar modificación antes de consultar XM | Coincide | Aprobado |
| HIST-07 | HU17 | Persistencia falla tras inferencia válida | Conservar pronóstico e informar fallo de guardado sin detalles privados | Coincide | Aprobado |
| HIST-UI-01/04 | HU12/HU13/HU17, refinamiento | Renderizar secciones, filtros y avisos | Mantener patrones; mostrar seguimiento y distinguir guardado/fallo | Coincide | Aprobado |
| HIST-UI-02/03 | HU05/HU07/HU08 | Detalle pendiente y evaluado con fixtures | Tabla y gráfica correctas; no inventar observaciones; validación de contrato | Coincide | Aprobado |
| PostgreSQL aislado | Integración del refinamiento | Aplicar migraciones, guardar once combinaciones y otras dos ejecuciones; evaluar doce; sesiones HTTP reales | Persistencia, propiedad, hash JSONB, primera evaluación concurrente y guardado desde controlador | Coincide | Aprobado |
| XM de solo lectura | Integración de observaciones | Consultar 2026-10-18 en los cuatro perfiles | Variable/unidad correctas y día completo | DemaReal 24 kWh; Gene 24 kWh; PrecBolsNaci 24 COP/kWh; DemaSIN 1 total kWh | Aprobado |
| Interfaz | Revisión visual técnica | Vista aislada con datos de ejemplo: abrir Patrones/Seguimiento, detalle y evaluar; revisar 390 px | Transición pendiente/evaluado, tabla y gráfica; sin desbordamiento global móvil | Coincide | Revisado |

Resultados automatizados: frontend 280 aprobadas, 0 fallidas (33 archivos, 1260 aserciones); backend afectado 98 aprobadas, 0 fallidas (6 archivos, 4609 aserciones). Compilación frontend, lint, tipos backend y prisma validate correctos.

PostgreSQL 16 en contenedor local desechable: imagen postgres:16-alpine, digest sha256:0cefaabd882e42bcb2a2f3dc56d3ce4770560ba62fd7f197f1a2e008fd5731ab. Migraciones aplicadas allí, 13 registros comprobados y 12 evaluaciones, incluidos acceso mediante sesión HTTP y primera evaluación ante concurrencia entre dos servicios. Datos de prueba eliminados. No se consultó la base productiva ni se evaluaron pronósticos de usuarios reales.

Las capturas usan datos de ejemplo y no prueban precisión real de Chronos ni recepción de mediciones físicas. Las consultas reales XM verifican disponibilidad/semántica del adaptador, no rendimiento de modelos. No se ejecutaron inferencias Python en esta validación.

Archivos: frontend-tests.txt, backend-tests.txt, postgres-validation.json, xm-readonly-validation.json y capturas historial-escritorio.png, historial-completo.png, historial-movil.png.

## Activación pendiente

El código, cliente Prisma y backend local están actualizados y la migración ya está aplicada en Neon. Para Azure falta transferir/publicar los cambios respetando el estado Git y las configuraciones privadas y construir la imagen nueva. El paso migrate es idempotente y debe informar que no hay pendientes. No reemplazar modelos ni credenciales.

```bash
sudo docker compose --env-file .env.deploy build app
sudo docker compose --env-file .env.deploy run --rm migrate
sudo docker compose --env-file .env.deploy up -d app
```

Comprobar salud, generar una nueva predicción con una cuenta de prueba autorizada y confirmar su guardado en Patrones. La evaluación manual real de esa predicción debe esperar a que finalice el día objetivo y XM publique datos completos. Ese cierre prospectivo y la aceptación del asesor siguen pendientes.

Para repetir la prueba aislada: backend/scripts/forecast-history-postgres-validation.ts exige ENERTRADE_INTEGRATION_DATABASE_URL y ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE=true, valida separación de la base habitual y solo acepta loopback. No usar la URL productiva ni publicar credenciales de prueba.

## Uso de IA

ChatGPT/Codex apoyó análisis, implementación, diseño de pruebas, integración y revisión visual. Verificación: resultados registrados arriba; revisión del estudiante y aceptación académica pendientes. No se inventaron evaluaciones históricas, fechas de sprints ni resultados prospectivos.
