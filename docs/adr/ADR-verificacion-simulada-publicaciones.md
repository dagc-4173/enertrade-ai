# Verificación informativa con perfiles horarios declarados

Estado: implementación local probada. Perfil configurable adoptado como opción recomendada, sin límites preasignados; preferencia de origen consultada al estudiante. Validación académica pendiente.

## Contexto y alternativas
No existe una capacidad física por usuario verificable en el repositorio. Usar pronósticos del SIN como garantía individual sería incorrecto. Se compararon dataset indicado por el estudiante y perfil configurable de simulación. Se prepara el perfil configurable recomendado: no contiene límites numéricos preasignados.

## Decisión
Perfiles separados para oferta/demanda, horas opcionales y límites explícitos en kWh. Cada cambio crea una versión inmutable. Regla determinista declared-hourly-capacity@1.0.0: cantidad <= límite de la hora. Sin perfil/hora/hora histórica: NO_REFERENCE; dentro del límite: APPROVED; exceso: REJECTED. Guardar la cantidad/fecha/hora, versión de perfil, regla, resultado, motivos y fecha de ejecución. Si cambia la publicación, mostrar OUTDATED sin reescribir el historial.

## Consecuencias
La verificación es informativa y voluntaria, no cambia reservas, matching, negociación ni compromisos existentes. Una aprobación significa únicamente cumplimiento del límite declarado de simulación; no acredita generación, consumo o disponibilidad física. Los límites aplican a cada fecha de los próximos siete días; no representan un presupuesto semanal agregado. No se exige aprobación para negociar en este incremento; convertirla en una condición de mercado requiere otro refinamiento explícito.

## Trazabilidad
Refinamiento de HU-21/HU-22, sin renumeración. Pruebas y evidencia asociadas a HU-20. No se declara una HU nueva completada ni validación académica. Apoyo de ChatGPT en diseño y código, revisión del estudiante pendiente.


## Evidencia
Ver docs/evidencias/verificacion-publicaciones/README.md: 43 pruebas backend, 51 frontend y nueve casos de integración HTTP/PostgreSQL aprobados; comprobación real de ausencia de referencia en navegador.

## Decisión posterior
Por instrucción explícita del estudiante el7/10/2026, el comportamiento informativo fue supersedido por ADR-verificacion-obligatoria-capacidad.md. Conservar esta decisión como antecedente, no como descripción vigente de autorización para negociar.
