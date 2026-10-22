# Resultados ejecutados — integración de oferta y precio

Fecha de ejecución: 21 de octubre de 2026. Estado: implementado y probado localmente con las limitaciones indicadas. No desplegado ni validado académicamente.

## Inferencia real

Evidencia: [verification.json](2026-10-21T07-08-02-129Z/verification.json).

Se usó el corpus histórico real multivariable ya conservado por el proyecto. Sus datos se transformaron en fixtures con la estructura de respuesta XM para ejercitar el adaptador, sin contacto con XM en vivo. El catálogo procede de una captura real conservada. Reloj controlado: 29 de septiembre de 2026 a las 08:00 UTC; origen observado: 28 de septiembre; objetivo: 30 de septiembre. Por ello son pruebas históricas de integración, no pronósticos prospectivos emitidos en septiembre. La fecha real de ejecución figura en la verificación.

| Combinación | Resultado obtenido | Estado | Evidencia |
|---|---|---|---|
| Oferta / Chronos-2 | HTTP 200; 24 periodos; kWh; horizonte 2 días | Aprobado | `supply-chronos2.json` |
| Oferta / Chronos-Bolt | HTTP 200; 24 periodos; kWh; horizonte 2 días | Aprobado | `supply-bolt.json` |
| Precio / Chronos-2 | HTTP 200; 24 periodos; COP/kWh; horizonte 2 días | Aprobado | `price-chronos2.json` |
| Precio / Chronos-Bolt | HTTP 200; 24 periodos; COP/kWh; horizonte 2 días | Aprobado | `price-bolt.json` |

Los cuatro casos usaron el trabajador Python real y checkpoints verificados por hash, con 672 observaciones de contexto y 48 periodos generados: 24 intermedios y 24 del objetivo. La autenticación se sustituyó únicamente en el script de prueba; no se usaron sesiones reales ni Prisma. No se calcularon MAE, RMSE, cobertura u otras métricas predictivas. Los resultados devuelven métricas históricas nulas para evitar atribuirles las de demanda.

## Comprobaciones automatizadas

- Backend: `bun run typecheck`, aprobado después de corregir el tipo de dos fixtures de prueba.
- Backend: `bun test src/tests/chronos-market.test.ts src/tests/chronos-hourly.test.ts src/tests/chronos-discovery.test.ts src/tests/xm-hourly-demand-acquisition.test.ts src/tests/forecast.test.ts src/tests/demand-v5-runtime.test.ts src/tests/price-forecast.test.ts src/tests/price-forecast-trace.test.ts src/tests/external-data.test.ts`: **262 aprobadas, 0 fallidas, 1113 aserciones**, nueve archivos.
- Frontend: `bun test tests/chronos-market.test.tsx tests/chronos-hourly.test.tsx tests/forecast.test.tsx`: **59 aprobadas, 0 fallidas, 234 aserciones**, tres archivos.
- Frontend: `bun run lint` y `bun run build`: aprobados.
- `git diff --check`: sin errores de espacios; advertencias de conversión LF/CRLF en archivos preexistentes modificados.

Los casos CHM y CHMF documentados en README obtuvieron sus resultados esperados. La regresión cubrió los recorridos existentes de oferta Ridge, demanda V5 y precio B1 además de Chronos. No se ejecutó una prueba manual de navegador, despliegue ni una sesión real de usuario.

## Pendientes y uso académico

La conexión actual con XM requiere una comprobación en vivo independiente; esta ejecución no la acredita. Se conserva el manejo explícito de timeout e insuficiencia de datos. Faltan evaluación temporal por variable, comparación contra sus líneas base, validación prospectiva y promoción, si los resultados lo justifican. El antecedente experimental de Chronos-2 en Gene permanece separado de esta nueva integración.

Esta evidencia es relevante para HU-04, HU-08, HU-14, HU-18 y HU-20 y para documentar el desarrollo de TG-II. No basta por sí sola para cerrar las HU ni para afirmar precisión validada. ChatGPT/Codex apoyó implementación, pruebas y redacción; el estudiante debe revisar y sustentar los resultados.
