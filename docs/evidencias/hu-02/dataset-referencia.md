# Dataset simulado de generación energética — referencia HU-02 v1

## Identificación y procedencia

- **HU:** HU-02 — Validar calidad de datos energéticos.
- **Naturaleza:** simulado y controlado.
- **Tipo:** `generacion`.
- **Alcance:** una única unidad de generación por dataset.
- **Significado de una fila:** una observación simulada de energía generada durante un intervalo. `fecha` identifica el instante de cierre del intervalo.
- **Ruleset asociado:** [generacion_simulada_base v1.0.0](ruleset-generacion-simulada-v1.md).

Esta definición constituye la línea base documental aprobada explícitamente por el estudiante en la instrucción de creación de estos archivos. No acredita implementación, generación de un archivo de datos ni ejecución de HU-02.

## Columnas aprobadas

| Columna | Tipo esperado | Obligatoria | Crítica | Nullable para calidad | Unidad |
| --- | --- | --- | --- | --- | --- |
| fecha | String temporal | Sí | Sí | No | No aplica |
| energia_kwh | Número JSON finito | Sí | Sí | No | kWh, declarada |
| zona | String cuando tenga valor | No | No | Sí; también puede estar ausente | No aplica |

- `energia_kwh` no tiene rango numérico definido en v1. Los valores negativos no deben rechazarse únicamente por su signo.
- Un faltante en `zona` produce advertencia. Un tipo incorrecto también produce advertencia.
- La obligatoriedad y nulabilidad para calidad no alteran la recepción de HU-01: el registro conserva los valores conforme a su contrato y HU-02 evalúa posteriormente la calidad.
- La unidad declarada no demuestra físicamente la unidad de origen del número.

## Identidad y límites

Dentro de esta referencia de una sola unidad, la identidad temporal corresponde al instante de cierre dentro del dataset. La comparación interpreta el instante, no la igualdad textual de fechas.

- No existe catálogo de zonas.
- No existe periodicidad obligatoria ni duración de intervalo fijada por esta ficha.
- No existen rangos energéticos aprobados.
- No se verifica físicamente la unidad de origen.
- No se realizan conversiones.
- No existe comparación de duplicados entre datasets.
- No se modifica el contenido ni se eliminan duplicados.

## Trazabilidad

- [Historias de Usuario.docx](../../contexto/Historias%20de%20Usuario.docx): HU-01 permite datos simulados; HU-02 exige revisión de calidad y distingue problemas críticos y no críticos.
- [Evidencia HU-01](../hu-01/pruebas.md): HU01-INT-01 utilizó los nombres `fecha`, `energia_kwh` y `zona`. Ese ejemplo comprobó persistencia, no estableció por sí mismo un contrato de dominio.
- La semántica de fila, columnas, criticidad, unidad y restricciones de esta ficha proviene de las decisiones explícitamente aprobadas por el estudiante para esta referencia, no de mocks del frontend.
- [Trabajo de grado II.docx](../../contexto/Trabajo%20de%20grado%20II.docx): HU-02 pertenece al backlog. La asociación inequívoca con un objetivo específico sigue **Pendiente de vinculación documental**.

La aprobación de esta línea base autoriza su uso en una implementación posterior; no equivale a validación formal/académica de la HU.

## Estado

- Dataset de referencia: Diseñado y aprobado para implementación de HU-02.
- Ruleset v1: Diseñado y aprobado para implementación.
- HU-02: Pendiente de implementación.
- Pruebas HU-02: Pendientes.
- Validación formal/académica: Pendiente.
