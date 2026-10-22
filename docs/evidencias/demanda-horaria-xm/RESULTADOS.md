# Evidencia de adquisición horaria experimental

Fecha de ejecución: 21 de octubre de 2026, America/Bogota. Repositorio base: `37f7b6553a13c547dc80bbe7d0500b5abdc85a28`. Cambios locales sin commit.

## Resultado técnico

Captura experimental DemaReal/Sistema implementada. 165 pruebas aprobadas, 0 fallidas, 537 aserciones en cuatro suites: `xm-hourly-demand-acquisition.test.ts`, `external-data.test.ts`, `xm-daily-sync.test.ts` y `demandasin.test.ts`. Verificación de tipos backend aprobada mediante `bun run typecheck`, sin emisión. Bun 1.3.13. No se ejecutó toda la suite del repositorio ni se validó despliegue.

Una consulta real a XM adquirió el 1 de enero de 2025: 24 periodos únicos, sin faltantes ni negativos. Respuesta y catálogo guardados en `sample-2025-01-01/`, junto con normalizado y manifiesto. Hash original: `a4e4820b11ac5d627cf05c4af04665773fe823d7b1473a910b2bf2a735afa6c3`. La verificación offline posterior queda en `verification.json`; su presencia con status passed acredita ese paso. No hay consulta PostgreSQL, migración, entrenamiento ni activación de modelos.

## Casos ejecutados

| ID | HU | Precondición | Pasos | Esperado | Obtenido / estado | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| DR-01 | HU-01/02 | Catálogo y día sintéticos válidos | 1. Adquirir con transporte sustituido. 2. Revisar petición. 3. Reproducir | Target independiente, 24 periodos, cero preservado, hashes válidos | Coincide / aprobado | Suite nueva |
| DR-02 | HU-01/06 | Proveedor productivo existente | 1. Consultar catálogo. 2. Intentar DemaReal por ruta productiva | Tres métricas conservadas; DemaSIN diario; rechazo de DemaReal productivo | Coincide / aprobado | Suite nueva y external-data |
| DR-03 | HU-01 | Fechas inválidas/rango excesivo/campo extra | 1. Solicitar captura. 2. Contar consultas | Rechazo anterior a red | Coincide / aprobado | Suite nueva, 4 variantes |
| DR-04 | HU-02 | Días con faltantes, extras, nulos, negativos, duplicados o identidad incorrecta | 1. Normalizar variante. 2. Verificar rechazo | Ninguna variante aceptada | Coincide / aprobado | Suite nueva, 9 variantes |
| DR-05 | HU-02 | Rango con día bisiesto | 1. Normalizar días desordenados. 2. Retirar día interno | Orden correcto; hueco rechazado | Coincide / aprobado | Suite nueva |
| DR-06 | HU-02 | Catálogo con unidad/resolución/definición o identidad duplicada alteradas | 1. Adquirir. 2. Contar consultas | Bloqueo antes de descargar serie | Coincide / aprobado | Suite nueva, 4 variantes |
| DR-07 | HU-01/02 | Transporte con fallos | 1. Simular HTTP, JSON, red, tamaño y timeout. 2. Revisar códigos | Fallo explícito y seguro | Coincide / aprobado | Suite nueva |
| DR-08 | HU-01/02 | Captura válida | 1. Alterar raw, catálogo, normalizado o calidad. 2. Reproducir | Alteración detectada | Coincide / aprobado | Suite nueva |
| DR-09 | HU-01 | Carpeta temporal nueva | 1. Guardar. 2. Leer y reproducir. 3. Guardar de nuevo | Replay correcto y sobrescritura rechazada | Coincide / aprobado | Suite nueva |
| DR-REAL-01 | HU-01/02 | XM público y catálogo compatible | 1. Consultar catálogo. 2. Adquirir 2025-01-01. 3. Guardar. 4. Reproducir offline | 24 periodos completos y hashes reproducibles | Captura aprobada; replay según verification.json | sample-2025-01-01 |

Las suites de regresión usan sustituciones de transporte/Prisma; no acreditan una integración DB real. La consulta DR-REAL-01 sí usa XM real, pero solo para un día histórico. No se afirma cobertura completa ni disponibilidad original de 2025.

## Archivos y continuidad

Proveedor XM: solo se exporta el normalizador existente. Archivos nuevos: adquisición y validación experimental, script CLI, suite y esta carpeta de evidencia. DemaReal no entra al importador, sync ni catálogo productivos. Los dos elementos sin seguimiento previos de pruebas append-only se conservaron.

Pendientes: corpus 2023–2025, perfil de preparación y persistencia compatibles, semántica temporal, disponibilidad histórica, fuentes meteorológicas y evaluación Chronos/Bolt/baselines. HU-01/HU-02 reciben evidencia parcial; HU-03/HU-06/HU-07 no se completan por esta captura. Mantener objetivos de TG-I.

Apoyo de IA generativa: Codex intervino en diseño, implementación y verificación; revisión académica y comprensión por el estudiante pendientes. Conservar esta evidencia para el informe TG-II.
