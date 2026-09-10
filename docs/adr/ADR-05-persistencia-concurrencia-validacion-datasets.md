# ADR-05 — Persistencia y concurrencia de la validación de calidad de datasets

**Estado:** Aceptado para implementación de HU-02.

## Contexto

HU-02 valida un dataset ya registrado por HU-01. El backlog exige un resultado de calidad trazable, pero no exige historial de validaciones. El contenido original debe permanecer inmutable y se necesita evitar la sobrescritura silenciosa entre solicitudes concurrentes.

Este registro continúa la numeración ADR-01 a ADR-04 de la sección «Registro de decisiones técnicas (ADR)» de [Trabajo de grado II.docx](../contexto/Trabajo%20de%20grado%20II.docx). Mantiene sus apartados de decisión, alternativas, justificación y compromisos/deuda. No se encontró una carpeta previa de ADR independientes; se inicia `docs/adr/` sin modificar el informe académico.

## Alternativas consideradas

### Persistencia

| Alternativa | Evaluación |
| --- | --- |
| Ampliar EnergyDataset: extender status y añadir validatedAt y validationReport | Menor complejidad y consulta directa; suficiente para un único resultado por dataset |
| Crear EnergyDatasetValidation con historial | Facilita revalidaciones y auditoría de múltiples ejecuciones, pero añade modelo, relación y coordinación del resultado vigente sin requisito actual de historial |

### Concurrencia

| Alternativa | Evaluación |
| --- | --- |
| update por id después de leer | Insuficiente: dos solicitudes pueden sobrescribirse |
| updateMany condicionado por id y status = recibido | Elegida: permite detectar mediante count si la escritura ganó, sin mantener una transacción durante el cálculo |
| Transacción larga / bloqueo explícito de fila | Mantiene recursos y bloqueos durante la evaluación; no resulta necesario para este incremento. Una transacción sin condición o bloqueo adecuado no evita por sí sola la sobrescritura |

## Decisión

- Ampliar EnergyDataset; no crear EnergyDatasetValidation en este incremento.
- Permitir una única validación completada por dataset, sin revalidación ni historial.
- Utilizar los estados `recibido`, `aprobado`, `advertencia` y `rechazado`.
- Añadir `validatedAt` nullable y `validationReport` nullable. Ambos permanecen nulos mientras no exista una validación completada.
- Escribir `status`, `validatedAt` y `validationReport` en una sola operación lógica de actualización.
- Condicionar la escritura final mediante el id del dataset y `status = recibido`, usando Prisma `updateMany`.
- Interpretar `count = 1` como escritura ganadora. En la competencia entre solicitudes sobre el mismo dataset existente, `count = 0` implica conflicto HTTP 409; no se sobrescribe el resultado ganador.
- Dos solicitudes pueden calcular en paralelo, pero solo una puede persistir. No se mantienen bloqueos explícitos de fila durante la evaluación.
- Mantener `content` y `pendingOptionalFields` intactos.
- Un fallo técnico no cuenta como validación completada. Un resultado de calidad `rechazado` sí cuenta como evaluación completada.

La operación condicionada proporciona atomicidad de los tres campos y evita escrituras parciales. La política presupone contenido inmutable y que las escrituras de este flujo respeten la condición. Ante una pérdida de conexión con resultado de confirmación incierto, debe consultarse el estado persistido antes de asumir que el intento no se completó.

## Justificación técnica

La decisión introduce menos complejidad y es suficiente para HU-02 actual. No inventa una necesidad de historial, conserva la trazabilidad del único resultado y evita sobrescrituras concurrentes. La evaluación no transforma ni elimina datos: conserva tanto el contenido como los pendientes detectados al registrar mediante HU-01.

## Consecuencias positivas

- Modelo simple.
- Consulta directa del dataset y su resultado.
- Persistencia atómica de estado, fecha e informe.
- Concurrencia controlada en la escritura final.

## Compromisos / deuda

- No permite revalidación en este incremento.
- No conserva historial de evaluaciones.
- Dos solicitudes pueden realizar cálculo redundante antes de competir por la escritura.
- `validationReport` depende de validación de aplicación porque es JSON; el tipo JSON por sí solo no verifica su estructura interna.

## Condiciones para reconsiderar

- Necesidad de revalidar un dataset.
- Aplicación de nuevas versiones de ruleset al mismo dataset.
- Historial exigido por el backlog.
- Edición posterior del contenido.
- Auditoría de múltiples ejecuciones.

## Trazabilidad y límites de la evidencia

- [Historias de Usuario.docx](../contexto/Historias%20de%20Usuario.docx), HU-02: evaluación de calidad, advertencias para problemas no críticos y bloqueo ante errores críticos.
- [Evidencias HU-01](../evidencias/hu-01/README.md): registro y persistencia de datasets ya verificados.
- [Dataset de referencia HU-02](../evidencias/hu-02/dataset-referencia.md).
- [Ruleset generacion_simulada_base v1.0.0](../evidencias/hu-02/ruleset-generacion-simulada-v1.md): el resultado expresa únicamente conformidad con ese ruleset, no calidad energética integral.
- Aprobación: instrucción explícita del estudiante para registrar esta decisión de persistencia y concurrencia.

HU-02 sigue **Pendiente de implementación**. Este ADR no constituye evidencia de pruebas ni acredita que los cambios Prisma o el control de concurrencia estén implementados. La validación formal/académica permanece **Pendiente**.
