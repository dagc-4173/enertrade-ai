# Perfil de preparación de generación simulada v1

## 1. Identificación

| Propiedad | Definición |
| --- | --- |
| HU | HU-03 — Preparar datos para pipeline IA |
| profileId | generacion_simulada_preparacion_base |
| profileVersion | 1.0.0 |
| Tipo admitido | generacion |
| Ruleset de origen | generacion_simulada_base, versión 1.0.0 |

Se adopta el identificador recomendado por el estudiante; no se encontró motivo para cambiarlo. Esta ficha documenta sus decisiones explícitamente aprobadas para el perfil, incluida la resolución del contrato temporal en la revisión final. El perfil queda diseñado y aprobado para diseño técnico; no autoriza por sí solo implementación ni acredita pruebas.

El alcance es una referencia simulada de una única unidad de generación por dataset. Cada fila representa energía durante un intervalo; fecha identifica su cierre. No aplica a consumo, oferta, demanda, precios ni transacciones_simuladas.

## 2. Fuente y dependencia

- [Historias de Usuario.docx](../../contexto/Historias%20de%20Usuario.docx), HU-03: transformar datos validados, producir y almacenar un dataset procesable; continuar con variables mínimas cuando falte contexto; impedir preparación sin validación; documentar transformaciones. Dependencias expresas: HU-02, reglas de transformación y definición de variables mínimas.
- [Referencia HU-02](../hu-02/dataset-referencia.md) y [ruleset v1](../hu-02/ruleset-generacion-simulada-v1.md): semántica, columnas, criticidad, unidad declarada e identidad temporal.
- [Evidencia HU-01](../hu-01/README.md) y [evidencia HU-02](../hu-02/README.md): etapas previas de registro y calidad. Los estados históricos pendientes de los documentos de diseño deben interpretarse junto con estas evidencias posteriores.
- [ADR-05](../../adr/ADR-05-persistencia-concurrencia-validacion-datasets.md): conservación del original y del resultado de calidad; no decide la persistencia de preparación.
- [Trabajo de grado I.docx](../../contexto/Trabajo%20de%20grado%20I.docx) y [pipeline conceptual](../../../Diagramas/06-pipeline-interno.md): antecedentes de limpieza, transformación e ingeniería de características; no son evidencia de implementación.
- [Trabajo de grado II.docx](../../contexto/Trabajo%20de%20grado%20II.docx): HU-03, Sprint 2, prioridad alta y 5 puntos en el backlog. Vínculo inequívoco con objetivo específico: **Pendiente de vinculación documental**.

Las operaciones concretas de esta ficha proceden de la instrucción explícita del estudiante para crearla, no de mocks ni de inferencias sobre modelos futuros.

## 3. Precondiciones

- Dataset registrado mediante HU-01, de tipo generacion y compatible con la referencia indicada.
- Validación completada mediante generacion_simulada_base 1.0.0, con resultado persistido aprobado o advertencia.
- recibido no permite preparación: falta validación. rechazado no permite preparación: hay errores críticos y este perfil no los repara.
- canProceed de HU-02 no reemplaza estas precondiciones ni define las transformaciones.

No se repite la evaluación de calidad como transformación. Este documento no prescribe aún mecanismos de comprobación, endpoint o códigos HTTP.

## 4. Variables mínimas

| Variable | Papel | Salida | Unidad |
| --- | --- | --- | --- |
| fecha | Mínima y crítica | String del mismo instante en UTC canónico con milisegundos | No aplica |
| energia_kwh | Mínima y crítica | Número JSON finito con el mismo valor | kWh, declarada |
| zona | Contexto opcional | String original cuando sea utilizable; propiedad omitida en caso contrario | No aplica |

fecha y energia_kwh son las variables críticas de la referencia. El escenario alternativo de HU-03 respalda continuar sin contexto disponible. Esta elección es específica de este perfil: no establece variables mínimas para otros datasets o modelos. No se definen target, label ni X/y.

## 5. Transformaciones

1. Seleccionar fecha y energia_kwh como variables mínimas; incluir zona únicamente como contexto utilizable.
2. Convertir la representación temporal al formato de la sección 7, preservando exactamente el instante.
3. Conservar valor y tipo numérico de energia_kwh y su unidad declarada kWh, sin corrección por signo.
4. Excluir zona no utilizable únicamente de la representación derivada y registrar esa exclusión.
5. Dejar las columnas adicionales exclusivamente en content original, sin transformarlas ni incorporarlas automáticamente al resultado preparado.

**Limpieza v1** significa exclusivamente exclusión de zona no utilizable de la representación preparada. No elimina filas, imputa, corrige críticos ni trata outliers.

**Normalización v1** significa exclusivamente normalización de representación temporal a UTC canónico. No significa normalización numérica, estadística o de unidades.

Se conserva el orden original de records. No se ordena por fecha. Cada fila original tiene su correspondiente fila preparada y se mantiene el conteo de registros.

No se eliminan ni corrigen duplicados: HU-02 los clasifica como error y bloquea la entrada del dataset al perfil.

No se generan características adicionales. **Generación de características específicas: pendiente de perfiles o consumidores posteriores.** No se crean hora, día, mes, día de semana, lags, medias móviles ni variables estadísticas. El perfil v1 cubre solo parcialmente la categoría general de HU-03; implementar este perfil no permite marcar la historia completa como completada.

## 6. Tratamiento de zona

| Situación original | Representación preparada | Trazabilidad |
| --- | --- | --- |
| String con algún carácter no blanco | Conservar exactamente el string | Contexto utilizado |
| Propiedad ausente | Omitir zona | Ausente |
| null | Omitir zona | Nula |
| String vacío | Omitir zona | Vacía |
| Solo espacios | Omitir zona | Solo espacios |
| Tipo distinto de string | Omitir zona | Tipo incompatible |

La comprobación de espacios no autoriza recortar un string utilizable: su contenido se conserva. No se imputa, convierte ni sustituye por etiquetas predeterminadas. No se elimina la fila.

Las razones anteriores son etiquetas documentales propuestas para explicar la exclusión, no nuevos códigos de calidad ni cambios en el informe HU-02. Su relación con sourceRecordIndex permite consultar el hallazgo original sin sobrescribirlo.

## 7. Formato temporal

Entrada válida según HU-02:

```text
YYYY-MM-DDTHH:mm:ss[.SSS](Z|±HH:mm)
```

La fracción puede estar ausente o tener uno, dos o tres dígitos, conforme al ruleset de origen.

Contrato de salida aprobado para el perfil:

> Representación temporal ISO 8601 canónica en UTC, con precisión de milisegundos, sin pérdida ni alteración del instante.

Para el rango ordinario de años representables con cuatro dígitos, la salida se representa como:

```text
YYYY-MM-DDTHH:mm:ss.SSSZ
```

Ejemplo documental: 2026-09-09T07:00:00-05:00 se representa como 2026-09-09T12:00:00.000Z. No se modifica el string original. Se conserva el instante sin redondeo; completar ceros en la representación de milisegundos no altera el momento observado.

Si la conversión UTC cruza el rango representable con cuatro dígitos, la serialización debe conservar el año completo mediante la representación extendida soportada por la plataforma. El formato de cuatro dígitos no constituye un límite universal de salida.

No se deben truncar años, aplicar módulo, limitar artificialmente el año ni desplazar el instante para ajustarlo al formato. No se rechaza un dataset únicamente porque su offset produzca un año UTC extendido, salvo que posteriormente se identifique una limitación técnica real que obligue a revisar expresamente esta decisión.

Esta decisión resuelve la incompatibilidad documental sin modificar HU-02 ni su ruleset. No prescribe una implementación ni obliga a utilizar un método concreto de serialización. La compatibilidad técnica deberá comprobarse durante el diseño y las pruebas posteriores; esta revisión no acredita su ejecución.

## 8. Estructura conceptual de salida

Contrato documental propuesto; no es esquema Prisma, tabla, contrato HTTP definitivo ni diseño de migración.

| Elemento | Contenido conceptual |
| --- | --- |
| profileId / profileVersion | Identificación de esta especificación |
| sourceDatasetId | Identificador real del dataset original |
| sourceRulesetId / sourceRulesetVersion | Identificación de la validación previa aplicable |
| recordCount | Número de filas preparadas, igual al original |
| variables | Distinción de variables mínimas y contexto, tipos y unidad declarada |
| records | Filas preparadas en orden original |
| transformations | Registro de las operaciones y exclusiones efectivamente realizadas |

Forma documental de cada registro:

```text
{
  sourceRecordIndex,
  fecha,
  energia_kwh,
  zona? // solo si es utilizable
}
```

sourceRecordIndex es el índice original basado en cero. Es metadato de procedencia, no una característica de ML. variables distingue conceptualmente fecha y energia_kwh del contexto zona aunque compartan objeto de registro.

transformations debe identificar selección de variables mínimas, conversión temporal aplicada, exclusiones de zona con índice y motivo, y nombres de columnas adicionales no utilizadas. Debe distinguir una exclusión efectiva de una operación sin exclusiones. No precisa copiar filas originales ni añadir parámetros inexistentes. La forma exacta de serializar este registro se concretará al diseñar persistencia.

## 9. Trazabilidad

HU-01 → contenido original → HU-02 y ruleset identificado → perfil de preparación identificado → representación derivada y operaciones documentadas.

content, pendingOptionalFields, validationReport y validatedAt permanecen íntegros. Este perfil no redefine el estado de calidad de HU-02. No se reindexa ni reordena el original.

sourceDatasetId junto con sourceRecordIndex permite comparar cada fila preparada con su fuente y los hallazgos existentes. La versión del perfil permite identificar las reglas utilizadas; no implica implementar historial o reejecución.

Esta ficha y su revisión final son evidencia de especificación aprobada para diseño técnico para Trabajo de Grado II. Deben conservarse posteriormente implementación, pruebas y resultados reales; su existencia no se anticipa aquí.

## 10. Cobertura

Cubierto **en la definición documental** del perfil v1:

- Validación previa como precondición.
- Selección de variables mínimas y separación conceptual del contexto.
- Conversión temporal y representación canónica, incluyendo año extendido cuando sea necesario para conservar el instante.
- Tratamiento no destructivo de zona contextual.
- Conservación del valor energético, del orden y de todas las filas.
- Trazabilidad al registro fuente y documentación de transformaciones.
- Definición conceptual del dataset preparado separado del original.

La generación y almacenamiento reales del resultado no están implementados. La categoría general de generación de características de HU-03 no queda satisfecha completamente por este perfil.

## 11. Exclusiones

- Imputación y eliminación de registros.
- Eliminación o corrección de duplicados.
- Corrección de críticos o reparación de datasets rechazados.
- Escalamiento, min-max, z-score y normalización estadística.
- Conversión o verificación independiente de unidades.
- Agregación, periodicidad y completado de intervalos.
- Rangos, outliers y corrección de energía negativa.
- Catálogo o transformación de zonas.
- Ordenamiento temporal.
- Características derivadas específicas y separación X/y.
- Generalización a otros tipos o garantía de aptitud para cualquier modelo ML.

## 12. Ejemplos documentales

Todos son **previstos y no ejecutados**. No contienen IDs obtenidos de la base ni resultados de pruebas. Se presupone registro HU-01 compatible y validación previa del ruleset indicado. Se muestran fragmentos de records; la envoltura conceptual de la sección 8 aplica a los tres casos, con recordCount igual a 1 y sourceDatasetId correspondiente al original.

### A. Entrada con estado aprobado

Fila original, índice 0:

```json
{"fecha":"2026-09-09T07:00:00-05:00","energia_kwh":12.5,"zona":"etiqueta-simulada"}
```

Fila preparada prevista:

```json
{"sourceRecordIndex":0,"fecha":"2026-09-09T12:00:00.000Z","energia_kwh":12.5,"zona":"etiqueta-simulada"}
```

Documentar selección de variables y conversión temporal; zona conservada sin alteración. La etiqueta es simulada y no crea catálogo geográfico.

### B. Advertencia por zona faltante

Fila original, índice 0:

```json
{"fecha":"2026-09-09T07:00:00-05:00","energia_kwh":12.5}
```

Fila preparada prevista:

```json
{"sourceRecordIndex":0,"fecha":"2026-09-09T12:00:00.000Z","energia_kwh":12.5}
```

Documentar selección de variables, conversión temporal y no utilización de zona por ausencia en sourceRecordIndex 0. La fila se conserva y no se imputa contexto. El mismo criterio de omisión aplica a null, vacío y espacios, conservando su motivo respectivo.

### C. Advertencia por tipo incorrecto de zona

Fila original, índice 0:

```json
{"fecha":"2026-09-09T07:00:00-05:00","energia_kwh":12.5,"zona":false}
```

Fila preparada prevista:

```json
{"sourceRecordIndex":0,"fecha":"2026-09-09T12:00:00.000Z","energia_kwh":12.5}
```

Documentar selección de variables, conversión temporal y exclusión de zona por tipo incompatible en sourceRecordIndex 0. false permanece en el original; no se convierte a texto ni se elimina la fila.

En todos los casos se mantienen los informes y metadatos originales. Si hubiera columnas adicionales, sus nombres se registrarían como no utilizados sin copiarlas automáticamente al preparado. Un dataset rechazado no produce dataset preparado; no se presenta como ejemplo de salida válida.

## 13. Decisiones futuras

- Verificación técnica posterior del contrato temporal aprobado, incluida la representación de años extendidos, sin modificar silenciosamente HU-02.
- Diseño de almacenamiento de la representación derivada y su relación con el origen; sin nombres definitivos de campos o tablas en esta fase.
- Política de repetición de preparación, concurrencia y manejo de fallos.
- Contrato definitivo de serialización, metadatos de ejecución y registro de transformaciones.
- Diseño del flujo de ejecución y endpoint, seguido de pruebas e integración real.
- Perfiles o consumidores posteriores que justifiquen características específicas y otros tipos de datos.
- Vinculación documental con objetivo específico y validación formal/académica.

Estas decisiones no reabren las políticas aprobadas de energía, zona, orden o conservación. No se diseña migración ni se agrega historial por inferencia.

## 14. Estado

- Perfil generacion_simulada_preparacion_base v1.0.0: **Diseñado y aprobado para diseño técnico**.
- Persistencia HU-03: **Pendiente**.
- Endpoint HU-03: **Pendiente**.
- Implementación HU-03: **Pendiente**.
- Pruebas HU-03: **Pendientes**.
- HU-03 completa: **Pendiente / potencialmente implementable de forma parcial mediante este perfil**.
- Validación formal/académica: **Pendiente**.

HU-03 no está completa. No se ejecutaron ejemplos ni pruebas funcionales para esta ficha.
