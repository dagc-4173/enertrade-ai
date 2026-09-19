# Resultados Técnicos por Objetivo - TG-II

Este documento prepara la tabla “Resultados por objetivo” del informe TG-II. Expone evidencia técnica, no conclusiones académicas definitivas.

| Objetivo | Resultado técnico verificable | Evidencias | Limitaciones | Estado |
| --- | --- | --- | --- | --- |
| OE1 | Se implementó el flujo de registro, validación y preparación de datasets con `EnergyDataset`, `PreparedDataset`, rulesets, perfiles, metadatos de procedencia y contratos HTTP. | [HU01](../evidencias/hu-01/README.md), [HU02](../evidencias/hu-02/README.md), [HU03](../evidencias/hu-03/README.md), ADR-05 a ADR-08. | No cubre universalidad de fuentes/datasets ni todos los perfiles posibles. | Implementada + probada + integración verificada |
| OE2 | Se diseñó e implementó una arquitectura monolítica Express/Prisma con responsabilidades separadas para pipeline, supply ML, demand ML, regla de precio, matching, patrones y API. | ADR-09, ADR-11, ADR-12, ADR-16, ADR-18; [HU04](../evidencias/hu-04-forecast/README.md), [HU06](../evidencias/hu-06-demandasin/README.md), [HU08](../evidencias/hu-08-precio/inferencia-b1/README.md), [HU10](../evidencias/hu-10/README.md), [HU12](../evidencias/hu-12/README.md), [HU14](../evidencias/hu-14/README.md). | No es arquitectura distribuida ni microservicios; no hay despliegue productivo. | Implementada + probada |
| OE3 | Se codificó el motor para entorno simulado: pipeline, `xm-gene-ridge` (ML), `xm-demandasin-ridge` (ML), `xm-preciobolsnaci-b1` (regla determinista), `matching-v1`, patrones, API, trazas, catálogo de versiones e indicadores. | HUs 01-15 y 17-19; ADR-13, ADR-17, ADR-20 a ADR-22; [HU20](../evidencias/hu-20/README.md). | HU16 no aplica; RBAC, históricos de versiones y despliegue pendientes. | Implementada + probada + integración verificada |
| OE4 | Se ejecutaron `665` pruebas con `0` fallos y `2074` expectativas; typecheck correcto; métricas de artifacts, pruebas de matching/patrones/errores/trazas y ejecución HU20 con HTTP + PostgreSQL real y cleanup. | Suites `backend/src/tests`, [HU05](../evidencias/hu-05-metricas-api/README.md), [HU07](../evidencias/hu-07-metricas-demanda/README.md), [HU09](../evidencias/hu-09-trazabilidad-precio/README.md), [HU11](../evidencias/hu-11/README.md), [HU15](../evidencias/hu-15/README.md), [HU17](../evidencias/hu-17/README.md), [HU20](../evidencias/hu-20/README.md). | No acredita validación académica, usabilidad con usuarios, SLA ni despliegue. | Implementada + probada + integración verificada |

## Límites transversales

- **RBAC:** pendiente; afecta el control de acceso esperado en HU13/HU19.
- **Despliegue:** pendiente; Neon es exclusivamente PostgreSQL, no el sistema desplegado.
- **CI:** no se detectó automatización de integración continua.
- **Trazas:** `AiQueryTrace` es best-effort y puede faltar si la persistencia falla.
- **Matching:** consulta publicaciones activas globales; no ejecuta transacciones reales.
- **Versiones:** no hay históricos; el catálogo publica solo capacidades activas del runtime.
- **Entrenamiento:** `trainedAt` no está registrado semánticamente.
- **Observabilidad:** no existe proveedor externo, retención ni alertas.

## Validación académica y despliegue

Ambos estados permanecen **Pendiente**. No se encontró evidencia de aprobación formal del asesor/jurado/acta ni URL o infraestructura de aplicación desplegada.
