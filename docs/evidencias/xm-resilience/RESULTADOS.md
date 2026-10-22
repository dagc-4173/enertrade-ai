# Resiliencia XM — 21/10/2026 (Bogotá)
Estado implementado y probado localmente. HU14/15 integración/errores; HU04–09 pronósticos. Sin cierre integral, despliegue ni validación prospectiva.

Consultas XM de solo lectura /Lists y /hourly: máximo2intentos, timeout original por intento y espera750ms. Reintenta timeout, red y HTTP408/429/502/503/504. No reintenta otros HTTP, codificación inválida ni tamaño excesivo; tampoco catálogos o datos inválidos rechazados después de recibirlos. Sin caché, cambios de fecha, relajación de calidad ni resultados sustituidos. Máximo30.75s por consulta con timeout15s, más tiempo de procesamiento; varias consultas e inferencia pueden sumar varios minutos. UI actualizada para reflejarlo.

Intentos de transporte guardados en manifest de capturas de demanda/oferta/precio y en discovery; los fallos finales de Chronos conservan intentos en failure.json. Los errores de catálogo/normalización no se reintentan. No se modifica autenticación ni pesos.

Pruebas: 43pass/0fail/4277aserciones en cinco archivos backend; typecheck aprobado. XM-RETRY-01 simula503 seguido de éxito con cuerpo idéntico y pausa750ms;02 HTTP400 y tamaño excesivo una llamada;03timeout exactamente2intentos y fallo conservado. Frontend246pass/0fail/1079aserciones, build y lint aprobados.

Real: Chronos-2 precio target2026-10-22/origen2026-10-18/h4,24períodos COP/kWh,cuantiles ordenados,14.124segundos. Ver2026-10-22T01-19-13-274Z (UTC) con result.json y verification.json. Catálogo y datos respondieron en primer intento en esta ejecución: no se atribuye recuperación real al reintento. Mismo código de servicio, sin prueba HTTP autenticada en esta ejecución. Cierra únicamente la ejecución técnica pendiente de Chronos-2 precio en la revisión anterior.

Backend reiniciado en puerto3000 para cargar cambios. Archivos afectados: xm-hourly-demand-acquisition.ts, chronos-market-series.ts, chronos-hourly.service.ts, xm-hourly-retry.test.ts y HourlyDemandPanel.tsx. Cambios locales sin commit; usuario gestiona commits manualmente.

IA: Codex apoyó implementación, pruebas y evidencia. Revisión del estudiante pendiente. Conservar para TG-II. Precisión futura y calibración de intervalos siguen pendientes.
