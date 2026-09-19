# ADR-21 - Catalogo transversal de capacidades versionadas

## Contexto

`/models` registra modelos ML y reglas predictivas, pero no cubre matching ni reconocimiento de patrones. HU18 requiere consultar la versión activa de las cinco capacidades analíticas sin llamar modelo IA a un método determinista.

## Alternativas

A. Ampliar `/models`: mezcla su contrato predictivo existente con métodos no predictivos. B. Crear `/models/active`: conserva la misma ambigüedad y puede interferir con `/:id`. C. Crear un catálogo transversal de capacidades: separa la semántica y preserva `/models`.

## Decisión

Se adopta `GET /capabilities/versions`. Proyecta fuentes de runtime: loaders de manifests para generación, demanda y precio; `matchingMethod` para matching; y `patternMethod` para patrones. Usa `ml_model`, `deterministic_rule` y `deterministic_method`.

Una versión es `active` solo porque la implementación runtime la referencia explícitamente. La fecha es nullable y devuelve `dateStatus: not_recorded` cuando no existe fecha semántica registrada. No se inventan históricos; solo se publican versiones reales.

## Consecuencias

No requiere Prisma, MLOps ni rompe `/models`. HU19 puede reutilizar esta proyección para indicadores. Las trazas HU17 registran consultas al catálogo, pero no reemplazan al catálogo como fuente de estado activo.

## Límites y futuro

No existen versiones históricas ni una capacidad conocida sin versión activa en v1. Si se introducen, la fuente de runtime debe declararlas explícitamente; no se infieren por archivos o fechas. RBAC para el rol de gerente de tecnología sigue pendiente.