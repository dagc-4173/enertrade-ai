# Verificación Predicciones — 21/10/2026 (Bogotá)
Estado: verificación técnica local. No validación prospectiva, despliegue ni cierre integral de HU. Fecha objetivo22/10/2026, origen18/10/2026, h4.

| Variable | Ridge | Chronos-Bolt | Chronos-2 |
|---|---|---|---|
| Oferta Gene | 24 períodos visibles en navegador autenticado | 24 cuantiles en servicio real | 24 cuantiles en servicio real |
| Demanda DemaReal | 24 períodos visibles en navegador autenticado | 24 cuantiles en servicio real | 24 cuantiles en servicio real |
| Precio PrecBolsNaci | 24 períodos en servicio real | 24 cuantiles en servicio real | EXTERNAL_TIMEOUT en adquisición XM; reintento único también falló |

Las llamadas de servicio invocan implementaciones reales con datos XM y pesos locales, sin sustituir autenticación HTTP ni probarla: no se equiparan a pruebas de interfaz. Catálogo oferta consultado en navegador con sesión real: ambos modelos configured:true. Primer intento UI Bolt oferta falló por timeout XM; posterior servicio pasó. No se ocultaron fallos. Resultados JSON, tiempos y fallos en carpeta2026-10-22T01-00-31-179Z (UTC). output-checks.json verifica 24salidas y orden de cuantiles para los seis archivos exitosos de servicio; unidades kWh y COP/kWh. No se entrenaron modelos ni comparó el futuro objetivo con valores reales.

Pruebas automatizadas: backend19 pass/0 fail/4221 aserciones (contratos/discovery/errores/Ridge). Frontend focal66pass y suite completa246pass/0fail/1079aserciones; build y lint aprobados.

Ajuste frontend HourlyDemandPanel.tsx: estado de consulta de catálogo y reintento visible al fallar/no estar configurado. La dificultad inicial de fecha fue de interacción automatizada con date input; se resolvió mediante teclado nativo. No constituye fallo confirmado del catálogo. Evidencia screenshot Ridge demanda.

Pendiente: verificar Chronos-2 precio con adquisición XM exitosa; probar Ridge diario V5/B1 por separado si se incluyen en checklist final; validación prospectiva de modelos sigue pendiente. Recomendación: mejora futura de resiliencia XM con reintentos acotados/backoff y evidencia de cada intento, sin falsear frescura ni desactivar validaciones.

HU relacionadas04–09 pronósticos y consulta;14/15 integración y manejo errores;17 trazabilidad. No declaración de cumplimiento integral. Uso IA: Codex apoyó ejecución, ajuste y comprobación; revisión del estudiante pendiente. Importante conservar para TG-II. Sesiones/cookies/credenciales no guardadas.
