# Ruleset generacion_simulada_base v1.0.0

## Identificación

| Propiedad | Valor |
| --- | --- |
| rulesetId | generacion_simulada_base |
| version | 1.0.0 |
| Aplica a | generacion |
| Referencia | [Dataset simulado de generación energética — referencia HU-02 v1](dataset-referencia.md) |
| HU | HU-02 — Validar calidad de datos energéticos |

Línea base documental aprobada por instrucción explícita del estudiante. No es código ejecutable. No se ha implementado ni probado este ruleset. Los cambios posteriores deben mantener identificable la versión de reglas utilizada.

## Formato temporal aprobado

```text
AAAA-MM-DDTHH:mm:ss[.SSS](Z|±HH:mm)
```

- Fecha y hora completas.
- `T` obligatorio.
- Offset obligatorio: `Z` o `±HH:mm`.
- Se admiten de 0 a 3 dígitos de fracción de segundo: sin fracción, o punto seguido de 1, 2 o 3 dígitos. No se admite un punto sin dígitos.
- No completar componentes ausentes.
- No corregir fechas inválidas.
- No eliminar espacios automáticamente.
- Debe representar una fecha y hora válidas, además de cumplir la forma textual.
- Para duplicidad se compara el instante representado, no el string textual.
- La interpretación para comparar no modifica el contenido original.

La implementación posterior puede utilizar parsing estricto que respete este contrato. Esta definición no prescribe una expresión regular ni añade periodicidad, orden o límites históricos.

## Reglas aprobadas

| Código | Condición | severity |
| --- | --- | --- |
| CRITICAL_VALUE_MISSING | En fecha o energia_kwh: null, string vacío o solo espacios | error |
| CRITICAL_TYPE_MISMATCH | fecha no string; energia_kwh no número JSON finito, excluyendo valores ya clasificados como faltantes | error |
| INVALID_TIMESTAMP | fecha string no vacía que incumple el formato aprobado o no representa una fecha/hora válida | error |
| DUPLICATE_TEMPORAL_IDENTITY | Dos registros con fechas válidas representan el mismo instante de cierre dentro del mismo dataset | error |
| OPTIONAL_VALUE_MISSING | zona ausente, null, string vacío o solo espacios | warning |
| OPTIONAL_TYPE_MISMATCH | zona presente y no vacía cuyo tipo no es string | warning |

Las fechas inválidas no participan en la comparación de duplicidad. No se eliminan registros.

Un valor faltante no genera además type mismatch. Una fecha con tipo incorrecto no genera además INVALID_TIMESTAMP. Una fecha vacía se clasifica como faltante, sin acumular INVALID_TIMESTAMP.

Cero y false no son valores vacíos: cero cumple el tipo de energia_kwh; false no lo cumple. Ambos incumplen el tipo de zona y producen warning cuando se usan en esa columna.

La ausencia estructural de una propiedad crítica no se añade aquí como otra regla: la referencia exige columnas críticas obligatorias y HU-01 ya comprueba la presencia de propiedades declaradas no opcionales. Las reglas de esta tabla no redefinen el contrato de recepción.

## Unidad declarada

La unidad de energia_kwh es kWh por declaración documental de la referencia. No se infiere la unidad por magnitud ni se convierte el dato. No existe en v1 una comprobación independiente de la unidad original. No se añade un código de hallazgo que simule tal verificación.

## Resultado agregado

| Resultado | Condición |
| --- | --- |
| aprobado | 0 errores y 0 advertencias |
| advertencia | 0 errores y al menos 1 advertencia |
| rechazado | Al menos 1 error; conservar también las advertencias encontradas |

El resultado significa exclusivamente:

> Conformidad con generacion_simulada_base v1.0.0

No significa calidad energética integral, validación física, validación de rangos, validación de periodicidad ni certificación de la fuente.

## Cobertura HU-02

Cubierto en la definición v1, todavía no implementado:

- Nulos/faltantes.
- Tipos para las tres columnas.
- Duplicidad temporal.
- Interpretación básica de fecha.
- Unidad declarada documentalmente.

Fuera de v1:

- Rangos energéticos.
- Periodicidad.
- Intervalos faltantes.
- Orden temporal.
- Catálogo de zonas.
- Conversión de unidades.
- Verificación independiente de la unidad original.
- Duplicidad entre datasets.
- Limpieza, imputación o normalización.

No se modifica el contenido del dataset. No se rechaza energia_kwh por signo negativo. La cobertura parcial no acredita cumplimiento integral de HU-02.

## Matriz de trazabilidad y pruebas futuras

Las pruebas de esta tabla son **Pendientes**, no resultados ejecutados. Las severidades por columna proceden de las decisiones aprobadas para la referencia.

| Regla | Criterio HU-02 | Severidad | Resultado posible | Prueba futura asociada |
| --- | --- | --- | --- | --- |
| CRITICAL_VALUE_MISSING | Datos críticos inválidos bloquean y se registra el error; revisión de nulos | error | rechazado | HU02-V1-01: null, vacío y espacios en cada campo crítico |
| CRITICAL_TYPE_MISMATCH | Datos críticos inválidos; tipo necesario para interpretar la variable | error | rechazado | HU02-V1-02: fecha no string y energia_kwh con tipo incompatible |
| INVALID_TIMESTAMP | Revisión de fechas inconsistentes | error | rechazado | HU02-V1-03: formato incompleto, fecha imposible, espacios y precisión fuera del contrato |
| DUPLICATE_TEMPORAL_IDENTITY | Revisión de duplicados | error | rechazado | HU02-V1-04: strings distintos con mismo instante; instantes distintos sin duplicidad |
| OPTIONAL_VALUE_MISSING | Faltantes no críticos permiten continuar con advertencia y trazabilidad | warning | advertencia sin errores; rechazado si coexisten errores | HU02-V1-05: zona ausente, null, vacía y espacios |
| OPTIONAL_TYPE_MISMATCH | Problema no crítico según decisión aprobada para zona | warning | advertencia sin errores; rechazado si coexisten errores | HU02-V1-06: zona numérica o boolean |
| Unidad declarada documentalmente | Revisión de unidades esperadas, con cobertura limitada | No genera hallazgo independiente | No determina por sí sola un resultado | HU02-V1-07: comprobar asociación documental y ausencia de conversión |
| Agregación y precedencia | Aprobación, advertencia o rechazo según hallazgos | Según hallazgos | aprobado / advertencia / rechazado | HU02-V1-08: cero hallazgos, solo warnings, errores y warnings; evitar hallazgos redundantes |
| Conservación del contenido y exclusiones | Límite entre calidad HU-02 y preparación HU-03 | No agrega severidad | Según reglas aplicables | HU02-V1-09: contenido idéntico; sin rechazo por signo, orden ni periodicidad |

## Ejemplos documentales

Son **casos previstos, no pruebas ejecutadas**. Emplean únicamente los valores del diseño previo. La etiqueta simulada no representa una zona geográfica ni crea un catálogo.

### Caso previsto: aprobado

```json
{
  "source": "Referencia simulada HU-02",
  "dataType": "generacion",
  "columns": [
    { "name": "fecha", "optional": false },
    { "name": "energia_kwh", "optional": false },
    { "name": "zona", "optional": true }
  ],
  "records": [
    {
      "fecha": "2026-09-09T12:00:00Z",
      "energia_kwh": 12.5,
      "zona": "etiqueta-simulada"
    }
  ]
}
```

Resultado esperado: aprobado, sin hallazgos.

### Caso previsto: advertencia

Mismos source, dataType y columns del caso anterior; records:

```json
[
  {
    "fecha": "2026-09-09T12:00:00Z",
    "energia_kwh": 12.5,
    "zona": null
  }
]
```

Resultado esperado: advertencia por OPTIONAL_VALUE_MISSING.

### Caso previsto: rechazado

Mismos source, dataType y columns; records:

```json
[
  {
    "fecha": "2026-09-09T12:00:00Z",
    "energia_kwh": "12.5",
    "zona": "etiqueta-simulada"
  }
]
```

Resultado esperado: rechazado por CRITICAL_TYPE_MISMATCH. HU-01 admite estructuralmente ese string; el ruleset exige un número.

## Fuentes y alcance de aprobación

- [Historias de Usuario.docx](../../contexto/Historias%20de%20Usuario.docx), HU-02: familias de calidad y escenarios de aceptación.
- [Dataset de referencia](dataset-referencia.md): semántica, columnas, criticidad y límites aprobados explícitamente por el estudiante.
- [Evidencias HU-01](../hu-01/README.md): implementación de recepción; no son pruebas ejecutadas del ruleset HU-02.
- [Trabajo de grado II.docx](../../contexto/Trabajo%20de%20grado%20II.docx): contexto académico y backlog. La vinculación a un objetivo específico continúa Pendiente de vinculación documental.

La descripción de HU-02 exige también rangos y unidades; esta versión declara expresamente sus límites y no afirma cobertura integral. La palabra “válido” del escenario exitoso se expresa aquí como resultado aprobado limitado a este ruleset. No se establece ni modifica el modelo Prisma.

## Estado

- Dataset de referencia: Diseñado y aprobado para implementación de HU-02.
- Ruleset v1: Diseñado y aprobado para implementación.
- HU-02: Pendiente de implementación.
- Pruebas HU-02: Pendientes.
- Validación formal/académica: Pendiente.
