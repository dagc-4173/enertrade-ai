# Preservación de bytes de modelos Ridge de demanda

Fecha: 2026-10-31. Estado: corregido y probado; pendiente commit/publicación y actualización de Azure. Mantenimiento de reproducibilidad del despliegue, sin cambio de arquitectura o capacidad predictiva. No se asigna una HU nueva ni se marca completada una HU heredada.

## Causa y decisión

Git almacenaba los JSON de demanda con LF; el equipo Windows y los hashes congelados usaban CRLF. Un checkout Linux cambiaba el hash y el cargador rechazaba el artefacto. Se conservaron los bytes CRLF originales mediante una regla específica `-text`, y se incorporaron de nuevo al índice solamente esos siete archivos. Se reconoce CR al final de línea en su revisión de whitespace; se mantienen las comprobaciones de espacios finales habituales. Los scripts shell siguen con LF.

Fijar solo `eol=crlf` arreglaría el checkout, pero dejaría blobs y archivos exportados con LF. Se eligió conservar los bytes originales también en el repositorio. No se editaron parámetros, modelos, versiones ni locks. El diff de los siete JSON corresponde únicamente a sus saltos de línea; es esperado que muestre muchas líneas.

## Pruebas ejecutadas

| ID | Precondición y pasos | Esperado | Resultado | Estado |
|---|---|---|---|---|
| RIDGE-BYTES-01 | Comparar bytes del índice candidato contra locks originales y JSON del último commit | Siete SHA-256 válidos y JSON equivalente | 7/7; solo LF/CRLF difiere | Probado |
| RIDGE-BYTES-02 | Crear snapshot temporal aislado de la corrección; clonar con core.autocrlf=false; ejecutar cargador real | Hashes y siete horizontes válidos | 7/7 | Probado |
| RIDGE-BYTES-03 | Repetir con core.autocrlf=true | Mismos hashes y modelos | 7/7 | Probado |
| RIDGE-BYTES-04 | Exportar snapshot con git archive TAR y ZIP; verificar bytes extraídos | Hashes originales | 7/7 en cada formato | Probado |
| RHR-01/04 | Ejecutar suite existente hourly-ridge.test.ts | Inferencia congelada y protección de artefactos correctas | 5 pruebas, 0 fallos, 4137 aserciones | Probado |

Las copias limpias usan un commit de validación exclusivamente temporal, creado fuera del repositorio del proyecto y sin publicar. Se trasladaron allí solamente los archivos candidatos del índice; no se copiaron .env, credenciales o checkpoints privados. Las verificaciones Linux corresponden a la configuración de Git sin conversión automática, ejecutada en Windows, no a una nueva VM Linux. El informe JSON contiene los hashes originales y resultados. Validación de checkout real en Azure pendiente hasta publicar la corrección.

## Evidencia y uso de IA

validation.json registra resultados de las cuatro comprobaciones de bytes. ChatGPT/Codex apoyó diagnóstico, ajuste y verificación. Revisión final del estudiante y commit pendientes. No se reconstruyeron imágenes ni se cambió producción para esta corrección aún.
