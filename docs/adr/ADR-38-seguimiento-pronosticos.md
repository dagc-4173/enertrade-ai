# ADR-38 — Seguimiento de pronósticos por usuario y evaluación posterior con XM

Fecha: 2026-10-30. Estado: implementado y probado localmente; migración en la base habitual aplicada y backend local actualizado; publicación de la imagen en Azure y aceptación académica pendientes.

## Contexto y trazabilidad

El estudiante autorizó incorporar en Patrones un historial de las predicciones y trasladar allí las columnas Real, Error y Error absoluto, que no aportaban información en la predicción futura. Refina HU05/HU07 (métricas), HU08 (precio), HU17 (trazabilidad) y la navegación de HU12/HU13 sin sustituir el análisis descriptivo. El nuevo requisito de seguimiento no tiene numeración, sprint ni story points asignados; no se inventan ni se modifica el alcance académico heredado automáticamente.

La trazabilidad AiQueryTrace no conserva el vector completo y uniforme de cada pronóstico. Las evidencias locales Chronos/Ridge y PriceForecastExecution son heterogéneas y no constituyen un historial completo por propietario.

## Alternativas

- Reutilizar únicamente AiQueryTrace: insuficiente para reconstruir valores de cada periodo y demostrar qué se predijo.
- Historial en navegador o archivos: no resuelve consulta entre dispositivos, propiedad uniforme ni evaluación durable.
- Tabla dedicada PostgreSQL mediante Prisma: utiliza la infraestructura existente y permite consulta paginada por usuario y conservación verificable del resultado.

## Decisión

Agregar ForecastHistory con relación al usuario, identificación de solicitud generada por servidor, modelo/versión, fuente, variable, unidad, fecha objetivo, origen, horizonte, vector original y SHA256 canónico. El orden de claves JSONB no afecta el hash. Un índice único usuario/solicitud impide duplicar el guardado de una misma ejecución. Las consultas nuevas al modelo siguen siendo ejecuciones independientes.

Los controladores guardan el resultado de servidor antes de responder, sin aceptar cargas de pronósticos desde el cliente. Los POST de oferta, demanda diaria y B1 en la app requieren sesión para atribuir el registro; las rutas horarias ya la requerían. Un fallo de persistencia no oculta el pronóstico y se informa en la interfaz. Las llamadas retrospectivas del runtime B1 no se presentan como pronósticos prospectivos.

El listado, detalle y evaluación se restringen al propietario incluso cuando es administrador. Se aplican comprobaciones de origen a mutaciones. La consulta es paginada a 20 registros y filtra por fecha objetivo, variable, modelo y estado.

La evaluación manual reutiliza las observaciones XM del mismo día: Gene, DemaReal horario, DemaSIN diario o PrecBolsNaci. Requiere día finalizado en Colombia y observaciones completas únicas, sin imputación. Calcula MAE, RMSE, sesgo y WAPE; para Chronos compara P50. WAPE es nulo si el denominador es cero. Guarda observaciones, errores, fuente, fecha de consulta y hashes. La primera evaluación completa se conserva con actualización condicional en PostgreSQL, también ante carreras entre procesos. Nunca reemplaza el pronóstico original.

## Consecuencias y límites

- Migración aditiva 20261030000100_forecast_history. No modifica registros anteriores ni importa archivos históricos sin contexto suficiente.
- El historial comienza con las nuevas ejecuciones de la versión actualizada. No hay evaluación automática programada ni reentrenamiento, ranking o comparación agregada de modelos.
- XM puede revisar sus publicaciones; el historial conserva la primera observación completa evaluada, no una versión permanentemente actualizada de XM.
- Los cuantiles siguen siendo experimentales. Una evaluación de un día no acredita calibración prospectiva ni precisión garantizada.
- La eliminación explícita de un usuario elimina su historial mediante FK Cascade; esta decisión no altera registros comerciales existentes.
- No interviene en pagos, verificación de entrega física o liquidación comercial.

## Verificación

Pruebas unitarias de normalización, propiedad, filtros, estado pendiente, persistencia fallida, integridad, errores y rutas HTTP; suite frontend; validación real en PostgreSQL 16 aislado con migraciones y sesiones; consultas públicas de solo lectura a las cuatro variables XM para 2026-10-18; revisión de interfaz con datos de ejemplo. Resultados y límites en docs/evidencias/seguimiento-pronosticos/README.md.
