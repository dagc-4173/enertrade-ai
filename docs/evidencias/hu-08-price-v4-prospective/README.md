# HU-08 Precio V4: captura prospectiva

Preregistración: commit `414a7c5`, tag `hu08-v4-preregistered`, cutoff `2026-10-01T16:18:30.593Z`. La única fuente de parámetros y criterios son el manifiesto y los siete modelos congelados bajo el tag. No hay reentrenamiento, evaluación de targets ni integración con el endpoint.

Desde `backend/`: `bun scripts/hu08-price-v4-prospective.ts`. El comando comprueba identidad Git, artefactos congelados y cadena JSONL existente antes de consultar metadatos persistidos de Precio y Gene. Requiere origen cerrado no anterior al cutoff, cobertura alineada, ventanas completas, ambas ingestas posteriores al cutoff y targets futuros aún desconocidos. Solo entonces lee datos de features desde t-14 hasta t. No invoca sincronización XM.

Las predicciones se agregan a `predictions.jsonl` con bloqueo exclusivo, sincronización de disco, hashes encadenados y rechazo de duplicados. Una ejecución sin origen válido informa `unavailable` por stdout y no crea predicciones. Repetir el comando no reescribe entradas existentes. No usar predicciones reconstruidas retrospectivamente como evidencia prospectiva.

Pruebas: `bun test src/tests/hu08-price-v4-prospective.test.ts src/tests/hu08-price-v4-preregistration.test.ts`. Conservar salida JSON del ciclo, hora, estado del repositorio, metadatos de las ventanas y, si hay captura, el archivo JSONL y sus hashes como evidencia de HU-08.