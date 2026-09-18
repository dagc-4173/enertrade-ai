# ADR-20: trazabilidad transversal de consultas IA

- Estado: aceptada
- Fecha: 2026-09-18
- Relacionada: HU17

## Contexto

Las trazas de precio, matching y análisis de patrones son artefactos funcionales distintos. No cubrían consultas de modelos, métricas o pronósticos de oferta/demanda, ni aportaban una correlación transversal con la solicitud HTTP.

## Decisión

Se incorpora `AiQueryTrace` como auditoría transversal, registrada al terminar las rutas IA conocidas. Guarda `requestId` interno, tiempos, solicitante, método HTTP, endpoint lógico, capacidad, parámetros permitidos, identificadores/versiones disponibles, estado mínimo y enlace opcional al artefacto funcional ya existente.

La persistencia es best-effort: su fallo se registra de forma segura como `AUDIT_TRACE_PERSISTENCE_FAILED` y no modifica la respuesta principal. No se expone `GET /traces`.

Los 4xx de validación se registran como `failed`; una ausencia funcional explícita del catálogo (`PREDICTIVE_ARTIFACT_NOT_FOUND`) se registra como `empty`.

## Alternativas consideradas

Extender cada tabla funcional duplicaría campos y no cubriría el catálogo ni las métricas. Capturar cuerpos/respuestas completos duplicaría snapshots existentes y aumentaría el riesgo de persistir datos no permitidos. Se descartaron ambas alternativas.

## Consecuencias y límites

No se persisten cuerpos, cabeceras, cookies, secretos ni resultados completos. Los parámetros se extraen por allowlist. Las rutas autenticadas solo se registran después de verificar identidad. Es una solución síncrona sin colas, broker ni workers; la consulta de trazas queda para una necesidad posterior con controles de acceso definidos.