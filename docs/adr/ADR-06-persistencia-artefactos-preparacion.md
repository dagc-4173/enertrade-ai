# ADR-06 — Persistencia de artefactos de preparación

## Estado

Aceptado para diseño técnico de HU-03.

## Contexto

HU-03 requiere preparar datos previamente validados y conservar las transformaciones aplicadas. EnergyDataset representa actualmente el dataset original, su recepción y el resultado de calidad HU-02. No existe todavía almacenamiento de preparación.

El primer perfil es generacion_simulada_preparacion_base, versión 1.0.0, [diseñado y aprobado para diseño técnico](../evidencias/hu-03/perfil-preparacion-generacion-v1.md). Aplica solo a generacion compatible con generacion_simulada_base 1.0.0, admite aprobado y advertencia y bloquea recibido y rechazado. Este ADR no modifica sus transformaciones ni completa la categoría de características específicas pendiente de consumidores posteriores.

La decisión procede de la aprobación explícita del estudiante para documentar este ADR. Continúa la convención de [ADR-05](ADR-05-persistencia-concurrencia-validacion-datasets.md) y se vincula con [Historias de Usuario.docx](../contexto/Historias%20de%20Usuario.docx), HU-03. Las [evidencias HU-01](../evidencias/hu-01/README.md) y [HU-02](../evidencias/hu-02/README.md) respaldan las etapas anteriores, no la implementación de HU-03.

## Fuerzas de decisión

- Preservar el original y su resultado de calidad.
- Mantener trazabilidad y reproducibilidad del artefacto derivado.
- Separar recepción, calidad y preparación sin redefinir estados existentes.
- Permitir perfiles/versiones diferentes sin inventar historial de ejecuciones.
- Garantizar unicidad, atomicidad y concurrencia segura con complejidad suficiente para el incremento.
- Mantener un formato utilizable por futuros consumidores sin anticipar un esquema de features de ML.

## Alternativas consideradas

### Alternativa A — Extender EnergyDataset

Guardar preparación junto al original ofrece una relación directa y menos entidades. Se descarta porque mezcla original, calidad y derivado, aumenta el registro y dificulta conservar resultados de varios perfiles o versiones sin otra evolución del modelo.

### Alternativa B — Entidad de preparación relacionada

Seleccionada. Una entidad independiente representa el artefacto completado y conserva una referencia obligatoria al original. Separa responsabilidades y permite expresar unicidad por dataset, perfil y versión. Añade una entidad y una relación, sin exigir historial de intentos.

### Alternativa C — EnergyDataset derivado

Se descarta crear otro EnergyDataset como preparado porque introduce ambigüedad sobre source, status, nueva validación y diferencia entre un dataset recibido y una representación derivada. Reutilizar esa entidad obligaría a redefinir su semántica actual.

## Decisión

Representar la preparación mediante una entidad independiente relacionada con EnergyDataset. No almacenarla dentro del original ni crear otro EnergyDataset derivado.

La identidad y procedencia se almacenarán en campos estructurados. El contenido preparado y el registro de transformaciones podrán almacenarse en JSON para este primer perfil: existe una estructura documental, zona es opcional, sourceRecordIndex debe conservarse y todavía no hay consultas SQL analíticas por observación ni un esquema definitivo de features.

No se diseñan tablas por observación ni almacenamiento externo de archivos.

Metadatos mínimos conceptuales, sin fijar aún nombres Prisma definitivos:

- Identificador propio.
- Referencia obligatoria al EnergyDataset origen.
- profileId y profileVersion.
- preparedAt, momento de preparación completada.
- sourceRulesetId y sourceRulesetVersion.
- Contenido preparado JSON.
- Transformaciones JSON.

recordCount se deriva de los registros y no requiere columna separada. source, dataType e informe HU-02 completo permanecen en EnergyDataset y no se duplican. Los identificadores del ruleset deben corresponder a la validación de origen.

No se agrega preparado ni ningún otro valor a EnergyDatasetStatus: continúa representando recibido, aprobado, advertencia y rechazado. La preparación completada se determina por existencia del artefacto asociado. Un original con status=advertencia puede tener una preparación completada.

## Cardinalidad e identidad

Un EnergyDataset puede tener cero o varios artefactos cuando correspondan a perfiles o versiones diferentes. Para cada combinación sourceDataset + profileId + profileVersion existirá como máximo un artefacto completado.

Esta cardinalidad no autoriza perfiles nuevos ni constituye historial de ejecuciones. No se registran intentos, estados transitorios o múltiples ejecuciones de la misma combinación en este incremento.

## Repetición

Si existe el artefacto de la combinación solicitada, se recupera el existente. No se recalcula, sobrescribe, cambia preparedAt ni crea otra ejecución. Esto es idempotencia funcional; el contrato HTTP se definirá posteriormente y no se diseña aquí.

## Concurrencia

La garantía principal es una restricción única en la base sobre dataset origen + profileId + profileVersion.

Flujo conceptual:

1. Comprobar las precondiciones del perfil.
2. Buscar el artefacto existente.
3. Si existe, recuperarlo.
4. Si no existe, calcular la preparación.
5. Intentar insertar el artefacto completo.
6. Si otra solicitud ganó únicamente la restricción única esperada, recuperar su resultado persistido.

La consulta previa es una optimización; la restricción única es la garantía. No se interpretan otros errores como una colisión recuperable.

Dos solicitudes pueden calcular redundantemente, pero solo una crea el artefacto. No se usan transacciones largas, locks explícitos, estados preparando ni actualización condicionada sobre EnergyDataset. Esta política presupone la inmutabilidad del original y de su validación completada; la unicidad no sustituye las precondiciones.

## Atomicidad y fallos

El artefacto se considera completado únicamente cuando toda su información queda insertada como una operación atómica. No se crea primero una fila parcial ni se presenta un resultado incompleto como válido.

Un fallo de transformación o persistencia no altera EnergyDataset, no deja una preparación parcial y no cambia status a rechazado. Un fallo técnico no equivale a un resultado de calidad.

Si se pierde la confirmación de la escritura, debe comprobarse la combinación única antes de asumir que no hubo inserción. Recuperar un artefacto confirmado no representa una nueva ejecución.

## Inmutabilidad

HU-03 no modifica en el original content, pendingOptionalFields, validationReport, validatedAt, status, source, dataType ni uploadedAt.

Una vez creado, el artefacto se trata como inmutable durante este incremento. Permanecen estables el dataset origen, profileId, profileVersion, preparedAt, ruleset de origen y versión, contenido preparado y transformaciones. No se diseña un endpoint UPDATE.

La restricción única evita duplicados; no impide por sí sola modificaciones arbitrarias. La implementación futura debe respetar la política de inmutabilidad.

## Integridad referencial

La relación obligatoria debe impedir eliminar el EnergyDataset origen mientras existan artefactos que lo referencien: ON DELETE RESTRICT o equivalente. No habrá eliminación silenciosa en cascada de preparados ni pérdida de la referencia original.

Se documenta únicamente esta propiedad; no se implementa eliminación ni se diseñan endpoints asociados.

## Consecuencias

### Positivas

- Separación clara entre original, calidad y artefacto derivado.
- Comparación y trazabilidad mediante dataset origen y sourceRecordIndex.
- Un resultado estable por combinación y recuperación idempotente.
- Persistencia atómica y concurrencia resuelta mediante unicidad.
- Evolución a perfiles/versiones diferentes sin sobrescribir artefactos.
- Conservación de los estados y de la semántica de HU-01/HU-02.

### Costes / deuda

- Entidad, relación y consultas asociadas adicionales.
- Almacenamiento del original y su representación preparada.
- Posible cálculo redundante en solicitudes concurrentes.
- Estructura y coherencia de JSON dependientes de comprobaciones de aplicación.
- No hay historial de intentos ni múltiples ejecuciones de la misma combinación.
- La reproducibilidad exige conservar las reglas e implementación de cada versión, no solo su identificador.
- La inmutabilidad debe respetarse en los flujos futuros; no se afirma que ya esté implementada para el artefacto.

## Cuándo reconsiderar

Revisar esta decisión si aparece:

- Contenido original editable.
- Revalidación del mismo dataset.
- Necesidad real de múltiples ejecuciones para la misma versión.
- Historial de preparaciones.
- Consultas SQL analíticas detalladas por observación.
- Problemas medidos por volumen de JSON.
- Necesidad de almacenar artefactos fuera de PostgreSQL.
- Perfiles cuya estructura no pueda representarse razonablemente con este modelo.

No se afirma que esas necesidades existan actualmente.

## Estado de implementación

- ADR: **Aceptado para diseño técnico**.
- Perfil HU-03: **Diseñado y aprobado para diseño técnico**.
- Prisma: **Pendiente**.
- Migración: **Pendiente**.
- Endpoint: **Pendiente**.
- Implementación HU-03: **Pendiente**.
- Pruebas: **Pendientes**.
- Validación formal/académica: **Pendiente**.

Este ADR es evidencia de decisión arquitectónica, no de implementación ni de pruebas. HU-03 completa permanece pendiente. No se modifica el perfil ni se presenta este diseño como almacenamiento existente.
