# ADR-10 — Pronóstico HU-06 con demanda agregada diaria DemaSIN

## Estado

Decisión adoptada para el incremento experimental de HU-06. Importación,
validación y preparación DemaSIN implementadas y probadas automatizadamente
con transporte/Prisma sustituidos. Sin entrenamiento ni inferencia de demanda;
integración PostgreSQL real del nuevo pipeline pendiente. Validación académica/formal pendiente.

## Contexto

HU-06 plantea pronóstico de demanda energética con histórico individual y posible
fallback agregado por zona. La infraestructura actual permite consultar XM DemaSIN,
demanda agregada del SIN, con granularidad diaria y unidad kWh. No aporta histórico
por usuario ni zona. Los mocks de interfaz no constituyen datos para ese propósito.

El proveedor normaliza DemaSIN como date, hour=null y value. La evidencia existente
registra una observación diaria; no demuestra una desagregación horaria. Los perfiles
actuales de Gene y su modelo de generación no constituyen un pipeline de demanda.

Referencias locales: [proveedor XM](../../backend/src/integrations/providers/xm.provider.ts)
y [contrato y evidencia de consulta](../../backend/src/integrations/README.md).

## Alternativas consideradas

- Pronóstico individual o zonal: mantiene el alcance completo del backlog, pero
  requiere fuentes e históricos que no están implementados.
- Reutilizar Gene como demanda o atribuir DemaSIN a usuarios/zonas: descartado
  porque cambia el significado de los datos sin evidencia.
- Pronóstico agregado diario con DemaSIN: alternativa adoptada para un incremento
  experimental delimitado y trazable.
- Usar mocks: rechazado como evidencia real de demanda; solo sirven como fixtures
  de pruebas controladas.

## Decisión

- Usar XM DemaSIN como fuente real de demanda agregada del SIN y como proxy
  técnico/contextual para HU-06 dentro del prototipo.
- No atribuir las predicciones a usuarios ni zonas. La demanda del sistema no
  equivale a consumo individual ni demanda zonal de la plataforma.
- Variable objetivo: `demanda_kwh`. Unidad: `kWh`. Granularidad: `daily`.
- Horizonte inicial: un día siguiente al origen diario. No equivale a 24
  predicciones horarias ni autoriza desagregar el valor diario.
- Conservar fechas calendario sin inferir timestamps.
- No devolver nivel de confianza hasta disponer de una definición y evaluación
  reproducible; no inventar porcentajes de confianza.
- Diseñar un pipeline independiente de Gene, con ruleset
  `xm_demandasin_base@1.0.0` y perfil `xm_demandasin_preparacion_base@1.0.0`.
  Esta independencia es de contratos y semántica: permite reutilizar la
  infraestructura común de consulta, registro y persistencia existente.
- No modificar Prisma salvo que una necesidad real aparezca y se justifique
  posteriormente.

## Trazabilidad con HU-06

Esta decisión delimita el futuro pronóstico experimental agregado; este incremento solo implementa su pipeline de datos.
Los criterios de personalización por usuario y fallback zonal permanecen
**pendientes**: no se sustituyen silenciosamente por la agregación nacional.
La disponibilidad de DemaSIN no permite declarar completada HU-06 en todo su
alcance original. La documentación del modelo y su futura respuesta deben
identificar el nivel de agregación y el uso contextual del resultado.

## Consecuencias y trabajo pendiente

- Validar con integración real la importación, validación y preparación de DemaSIN antes
  de adquirir un corpus de entrenamiento; conservar intactos los contratos Gene.
- Verificar cobertura diaria, huecos, duplicados, valores y procedencia; congelar
  corpus y particiones temporales antes de evaluar candidatos.
- Una observación por día implica menos muestras que Gene para un mismo rango.
  No trasladar automáticamente sus features, horizonte, modelo o métricas.
- Elegir y evaluar baselines y modelo después de caracterizar el corpus. Este
  ADR no selecciona algoritmo ni acredita suficiencia histórica.
- Definir la disponibilidad de datos al origen y el comportamiento ante historia
  insuficiente antes de implementar inferencia.
- Incorporar métricas reproducibles y versionamiento sin afirmar generalización
  fuera de los periodos evaluados.
- Mantener pendientes fuentes individuales/zonales y definición del nivel de
  confianza. No se introduce frontend ni un nuevo endpoint mediante este ADR.

## Incremento implementado

POST /external-data/import acepta xm/DemaSIN además de Gene. Reutiliza query y
registerDataset, registra dataType=demanda y columnas requeridas fecha_xm y
demanda_kwh. Source conserva XM/SINERGOX, métrica, unidad, rango y mapping=xm-demandasin-v1.
No incluye hora, zona o timestamp. No valida ni prepara automáticamente.

HU-02 selecciona xm_demandasin_base@1.0.0 por dataType=demanda y columnas
obligatorias compatibles, nunca por source. Comprueba calendario, valor finito e
identidad única por fecha. Reutiliza issues críticos e INVALID_XM_DATE; añade
DUPLICATE_XM_DATE. Sin restricciones de signo ni advertencias. El guard estructural
existente rechaza contenido vacío o no finito con 409; valores inválidos dentro de
una estructura admitida producen status=rechazado. No se cambia la semántica previa.

HU-03 exige el informe aprobado exacto y coherente, conserva los registros e índices
según entrada, declara kWh y temporalIdentity calendar-date. No ordena, agrega,
imputa, redondea ni crea features. Reutiliza idempotencia y recuperación P2002.
Los perfiles de generación permanecen independientes.

Una consulta/importación exitosa no demuestra continuidad histórica: pueden faltar
días. El corpus y la caracterización deben verificarlo antes de entrenar. Importar
de nuevo puede crear otro EnergyDataset; no se añade idempotencia de importación.

Pruebas ejecutadas: DemaSIN + fuentes externas aisladas, 99 aprobadas; backend
completo, 284 aprobadas, 0 fallidas, 996 aserciones. Typecheck correcto. No se
adquirió corpus ni se consultó XM/PostgreSQL real en este incremento.
