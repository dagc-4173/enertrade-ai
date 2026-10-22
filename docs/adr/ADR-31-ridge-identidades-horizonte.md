# ADR-31 — Identidad de Ridge por horizonte y conservación de versiones históricas

Estado: implementado y probado localmente. Fecha: 21/10/2026.

## Contexto

La revisión funcional detectó que el catálogo general y el registro de capacidades anunciaban Ridge legacy mientras los servicios ejecutaban oferta V2 y demanda V5. Ambos recorridos seleccionan un artefacto distinto según el horizonte desde el origen observado. El contrato de capacidades suponía exactamente cinco filas y no representaba esa selección real.

## Alternativas

1. Sustituir el identificador antiguo por h1 como representante: mantendría cinco filas, pero ocultaría las identidades efectivamente ejecutadas en h2..h7/h6.
2. Crear identificadores sintéticos de familia y devolver métricas agregadas: añadiría una entidad y exigiría definir una agregación que no corresponde a las evaluaciones existentes.
3. Publicar cada identidad real por horizonte y conservar las antiguas como históricas: permite cotejar directamente respuesta, metadatos y métricas, con un ajuste compatible en consumidores locales.

## Decisión

Se adopta la tercera alternativa. El catálogo general contiene siete Ridge de oferta V2, seis de demanda V5, la regla B1 y las dos versiones legacy. Estas últimas mantienen detalles y métricas originales con `activeInRuntime=false`. El registro de capacidades contiene los trece Ridge actuales, B1 y los dos métodos existentes: dieciséis registros y cinco clases de capacidad.

Se utilizan los mismos loaders que la inferencia. Los nuevos Ridge mantienen `promoted=false` y validación académica pendiente; el V5 conserva su condición prospectiva pendiente. Estar conectado al servicio no equivale a aprobar la promoción del protocolo. Las métricas de oferta siguen siendo holdout temporal y las de V5 VALIDATION técnica, por identidad y horizonte. No se recalculan ni se mezclan.

El parser frontend acepta varias identidades ML por oferta/demanda, exige las cinco clases de capacidad, limita tamaño y rechaza duplicados por capacidad/identificador. Las filas usan una clave compuesta para evitar colisiones. Se conserva compatibilidad con respuestas anteriores de cinco registros. No cambia el diseño de Predicciones.

## Consecuencias

Los consumidores externos que dependan de exactamente cinco registros deben migrar a identificar artefactos por capacidad e identidad. La estructura de cada registro y los endpoints se conservan. Los catálogos Chronos siguen disponibles en sus rutas específicas; esta decisión corrige el registro tradicional Ridge/B1, sin promover ni reemplazar modelos experimentales.

No se modifican pesos, fuentes, horizontes, historias de usuario ni arquitectura predictiva aprobada en TG-I. Trazabilidad: HU-05/07 (métricas), HU-14 (contrato), HU-18 (versionado), HU-20 (integración).
