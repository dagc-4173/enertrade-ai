# EnerTrade AI — Instrucciones de desarrollo

## Contexto

EnerTrade AI es un proyecto de Trabajo de Grado II de Ingeniería en Software.

El proyecto continúa directamente el trabajo realizado en Trabajo de Grado I.
No debe tratarse como un proyecto nuevo.

## Documentación disponible

Antes de tomar decisiones relevantes, consultar cuando corresponda:

- `docs/contexto/Trabajo de grado II.docx`
- `docs/contexto/Historias de Usuario.docx`
- `docs/contexto/Trabajo de grado I.docx`
- `docs/contexto/Lineamientos_APA7_TDG_Ingenieria_Software.pdf`
- `docs/contexto/MANUAL-GRAFICO-2024_compressed.pdf`
- `docs/gestion/Correo con instrucciones.docx`

## Uso de las fuentes

La documentación tiene funciones diferentes.

### Estructura académica
`Trabajo de grado II.docx` define la estructura obligatoria del informe.

### Backlog funcional
`Historias de Usuario.docx` define las historias de usuario, criterios de
aceptación, dependencias y sprints propuestos.

### Línea base histórica
`Trabajo de grado I.docx` contiene el diseño, alcance y decisiones heredadas
de Trabajo de Grado I.

No asumir que algo descrito en Trabajo de Grado I está implementado.

### Implementación real
El código fuente, configuración, base de datos y pruebas del repositorio son
la fuente de verdad para determinar qué está realmente implementado.

## Regla principal

Nunca afirmar que una funcionalidad está implementada únicamente porque:

- aparece en una historia de usuario;
- aparece en documentación;
- existe una pantalla;
- existe un mock;
- existe un archivo con ese nombre;
- aparece en un diagrama.

Verificar siempre el código real.

## Estados permitidos

Cuando se analice una funcionalidad, utilizar cuando corresponda:

- Planeado
- Diseñado
- Implementado parcialmente
- Implementado
- Probado
- Validado
- Desplegado
- Pendiente

No marcar como probado algo cuya prueba no haya sido ejecutada.

## Flujo de trabajo

Antes de modificar código:

1. Revisar la implementación existente.
2. Identificar la HU relacionada.
3. Revisar sus criterios de aceptación.
4. Identificar dependencias.
5. Proponer el cambio mínimo necesario.
6. Identificar archivos afectados.
7. Identificar pruebas necesarias.

Evitar refactorizaciones no relacionadas con la tarea.

No introducir tecnologías nuevas sin una justificación técnica verificable.

## Historias de usuario

Cada cambio funcional debe poder relacionarse con una HU.

Una HU solo puede considerarse completada cuando:

- existe implementación funcional;
- los criterios de aceptación están cubiertos;
- las pruebas correspondientes fueron ejecutadas;
- existe evidencia suficiente.

## Arquitectura

Preservar la arquitectura existente siempre que sea razonable.

Antes de realizar un cambio estructural importante:

- explicar el problema;
- identificar alternativas;
- justificar la decisión;
- indicar consecuencias y riesgos.

No realizar cambios arquitectónicos importantes sin autorización.

## Machine Learning / IA

No asumir que existe una capacidad de IA porque aparezca en una interfaz o
documento.

Para cualquier modelo real identificar cuando aplique:

- dataset;
- origen;
- variables;
- preparación;
- algoritmo;
- entrenamiento;
- prueba;
- métricas;
- versión;
- limitaciones.

Una pantalla de predicciones no constituye evidencia de un modelo predictivo.

## Funcionalidad heredada

El backlog actual utiliza reconocimiento de patrones.

La funcionalidad histórica relacionada con:

- anomalías;
- anomaly detection;
- fraude;
- alertas por anomalías;

debe considerarse potencialmente heredada u obsoleta.

No eliminarla automáticamente.

Primero analizar su relación con el backlog actual.

## Pruebas

Las pruebas deben corresponder al sistema real.

Nunca inventar:

- resultados;
- métricas;
- pruebas aprobadas;
- datos;
- evidencias.

Cuando se ejecute una prueba relevante conservar información suficiente para
documentar:

- ID;
- HU asociada;
- precondición;
- pasos;
- resultado esperado;
- resultado obtenido;
- estado;
- evidencia.

## Evidencia para Trabajo de Grado II

Cuando una tarea produzca evidencia relevante, indicarlo explícitamente.

Ejemplos:

- captura de pantalla;
- commit;
- endpoint;
- prueba ejecutada;
- resultado de modelo;
- métrica;
- log;
- configuración;
- diagrama;
- integración funcional.

## Comportamiento durante tareas

Si la instrucción es analizar:

NO modificar archivos.

Si la instrucción es implementar una tarea específica:

implementar únicamente esa tarea y evitar cambios adicionales no autorizados.

Después de una implementación indicar:

1. archivos modificados;
2. comportamiento implementado;
3. HU y criterios cubiertos;
4. pruebas ejecutadas;
5. resultados;
6. pendientes;
7. evidencia que debe conservarse.