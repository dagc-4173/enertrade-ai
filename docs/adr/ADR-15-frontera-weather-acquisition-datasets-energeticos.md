# ADR-15 — Frontera semántica entre adquisiciones meteorológicas y datasets energéticos

**Estado:** Aceptado para el alcance actual de Trabajo de Grado II.

## Contexto

El esquema Prisma actual define `EnergyDatasetType` con los valores:

- `generacion`;
- `consumo`;
- `oferta`;
- `demanda`;
- `precios`;
- `transacciones_simuladas`.

No existe el tipo `meteorologia`. `EnergyDataset` representa un dataset recibido con `source`, `dataType`, estado, contenido JSON, pendientes opcionales y resultado de validación. `PreparedDataset` representa un artefacto derivado mediante un perfil y un ruleset versionados.

`registerDataset` valida `dataType` contra el enum generado por Prisma, valida columnas y registros y guarda el contenido en `EnergyDataset`. La validación posterior tiene ramas explícitas para generación, demanda y precios. La preparación tiene perfiles específicos para generación simulada, XM Gene, XM DemaSIN y XM precio.

El flujo meteorológico actual es distinto. `WeatherAcquisition` se representa mediante un envelope, un manifest, un snapshot normalizado, provenance y hashes. La adquisición se conserva fuera de Prisma mediante almacenamiento local de evidencia.

NASA POWER aporta variables meteorológicas y su provenance; no aporta generación real de una planta fotovoltaica. Por tanto, una adquisición meteorológica no equivale a un dataset de generación y no debe registrarse como `dataType = generacion`.

## Problema

Incorporar meteorología directamente en `EnergyDataset` puede confundir una feature externa con un target energético. Añadir `meteorologia` al enum sin crear simultáneamente ruleset, perfil de preparación y consumidor produciría un tipo registrable pero no procesable por la arquitectura actual.

La frontera debe permitir conservar evidencia meteorológica reproducible y, posteriormente, usarla como entrada de un dataset de modelado sin afirmar que la meteorología contiene el target de generación.

## Alternativas consideradas

### Opción A — Mantener WeatherAcquisition fuera de EnergyDataset

**Ventajas:**

- conserva la fidelidad semántica entre adquisición externa y dataset energético;
- reutiliza manifest, snapshots, provenance y hashes existentes;
- no requiere Prisma ni migraciones;
- no modifica `dataset.service`, validación ni preparación;
- permite usar la adquisición como fuente de features en una etapa posterior;
- reduce el riesgo de confundir meteorología con target.

**Desventajas:**

- no existe una FK entre la adquisición y un futuro dataset derivado;
- la trazabilidad relacional inicial depende de `acquisitionId`, hashes y provenance;
- consultas relacionales sobre adquisiciones no están disponibles en PostgreSQL.

**Impacto:** bajo en el código actual y compatible con el alcance de TG-II.

### Opción B — Añadir `EnergyDatasetType = meteorologia`

**Ventajas:**

- permitiría reutilizar el registro genérico de `EnergyDataset`;
- ofrecería una categoría Prisma consultable junto con los datasets existentes.

**Desventajas:**

- requiere cambiar el enum y crear una migración;
- obliga a ampliar `dataset.service` y el cliente Prisma;
- requiere nuevas ramas en `dataset-validation.service`;
- requiere un ruleset meteorológico;
- requiere un perfil de preparación meteorológico;
- puede dar la impresión incorrecta de que una serie meteorológica es un dataset energético entrenable;
- añadiría una categoría sin target de generación ni consumidor existente.

**Impacto:** alto y transversal. El enum por sí solo no haría procesable el nuevo tipo.

**Riesgo:** registrar datos meteorológicos como datasets sin separar claramente features, metadata de sitio y target.

### Opción C — Crear una entidad Prisma separada

Una entidad futura como `WeatherAcquisitionRecord` podría indexar `acquisitionId`, provider, versión, coordenadas, rango, variables, hashes, normalizador, cantidad de observaciones y ubicación controlada del snapshot.

**Ventajas:**

- mantiene la separación semántica respecto de `EnergyDataset`;
- permite trazabilidad relacional futura;
- facilita consultas por provider, rango, coordenadas y hashes;
- puede relacionarse posteriormente con un dataset derivado o una versión de modelo.

**Desventajas:**

- requiere una entidad, migración, cliente Prisma y pruebas de relaciones;
- exige definir retención, concurrencia, integridad y referencia a snapshots;
- añade complejidad antes de existir un caso de consulta relacional demostrado;
- no resuelve por sí sola la ausencia de target PV ni de metadata de planta.

**Impacto:** medio/alto en persistencia, sin necesidad inmediata para el flujo local reproducible existente.

**Riesgo:** crear un modelo de adquisición antes de definir el dataset derivado y sus consumidores reales.

## Decisión

Se elige la **Opción A** para el alcance actual de Trabajo de Grado II.

`WeatherAcquisition` permanece separado de `EnergyDataset` y se conserva como fuente/evidencia meteorológica reproducible.

No se hará lo siguiente en este alcance:

- añadir `meteorologia` a `EnergyDatasetType`;
- registrar adquisiciones meteorológicas como `dataType = generacion`;
- crear una entidad Prisma `WeatherDataset`, `WeatherAcquisitionRecord` o equivalente;
- modificar `schema.prisma` o crear migraciones;
- crear un perfil meteorológico en la preparación actual.

Un futuro dataset destinado a modelado deberá combinar explícitamente:

- features meteorológicas;
- metadata del sitio o planta;
- un target energético real;
- alineación temporal verificable;
- provenance de las adquisiciones utilizadas.

La adquisición actual se referencia mediante `acquisitionId`, hashes, provider, versión, rango, coordenadas y normalizador. Esa referencia no se convierte todavía en una relación Prisma.

## Justificación

La decisión conserva la fidelidad semántica: el resultado de NASA POWER es meteorología, no producción eléctrica observada.

También mantiene separadas feature y target. El repositorio no contiene target real de generación fotovoltaica, capacidad instalada, inclinación, azimut, identidad de planta ni una serie temporal alineada clima-generación. En consecuencia, no existe todavía un dataset supervisado PV defendible que justifique ampliar el modelo energético.

La reproducibilidad ya está cubierta por las capas de adquisición, normalización, manifest, hashes, almacenamiento local y replay. No es necesario duplicar esa información dentro de `EnergyDataset`.

Mantener la frontera evita modificar el pipeline existente de registro, validación, preparación y modelos XM. También evita una migración prematura basada únicamente en la existencia de variables meteorológicas.

## Consecuencias positivas

- No se rompe el pipeline actual de `EnergyDataset` y `PreparedDataset`.
- No se modifica Prisma ni se crean migraciones.
- Se conserva evidencia meteorológica reproducible.
- No se mezclan features meteorológicas con generación agregada XM ni con un target inexistente.
- Se mantiene la posibilidad de crear posteriormente un dataset clima + target energético.
- La evolución futura puede elegir una entidad separada cuando exista una necesidad relacional real.

## Consecuencias y deuda técnica

- No existe una FK entre una adquisición meteorológica y un dataset derivado.
- La trazabilidad actual depende de `acquisitionId`, hashes y provenance.
- Un futuro dataset derivado deberá conservar la referencia explícita a las adquisiciones utilizadas.
- Podría evaluarse `WeatherAcquisitionRecord` u otra entidad separada si se necesita consultar adquisiciones desde PostgreSQL.
- Todavía no existe un perfil de preparación para un dataset que combine meteorología y target energético.
- La adquisición meteorológica no demuestra por sí sola capacidad de entrenamiento o validación de un modelo PV.

## Condiciones para reabrir la decisión

Reevaluar esta frontera cuando exista evidencia de al menos un caso de uso concreto y, preferiblemente, de varios de los siguientes elementos:

- target real de generación;
- metadata de planta o sitio;
- capacidad instalada;
- alineación temporal entre clima y generación;
- necesidad real de entrenamiento o predicción por tecnología;
- necesidad de consultar adquisiciones meteorológicas relacionalmente en PostgreSQL;
- volumen o retención que haga insuficiente el almacenamiento local;
- perfil de preparación y ruleset meteorológico definidos;
- relación técnica clara entre adquisición, dataset derivado y versión de modelo.

## Trazabilidad y límites

- **C2:** contrato, adquisición, normalización, canonicalización, hashes, manifest, envelope y replay.
- **C3:** consulta y adquisición HTTP meteorológica desde `external-data`.
- **HU-01:** posible registro futuro de un dataset derivado, no de la adquisición meteorológica directamente.
- **HU-02:** posible validación futura del dataset derivado mediante un ruleset específico.
- **HU-03:** posible preparación futura del dataset derivado mediante un perfil versionado.
- **HU-18:** versionado de providers, normalizadores, perfiles y artefactos.
- **Futura capacidad PV:** posibilidad futura, no implementada ni demostrada actualmente.

HU-01, HU-02, HU-03 y HU-18 no se marcan como completadas por este ADR. Este ADR no crea un dataset meteorológico, no crea un modelo PV y no demuestra un target de generación fotovoltaica.

## Estado de implementación

- ADR: **Aceptado para el alcance actual de Trabajo de Grado II**.
- WeatherAcquisition fuera de `EnergyDataset`: **Decidido**.
- `EnergyDatasetType = meteorologia`: **No adoptado**.
- Entidad Prisma meteorológica: **Pendiente y deliberadamente pospuesta**.
- Dataset clima + target energético: **Pendiente**.
- Perfil/ruleset meteorológico: **Pendiente**.
- Validación académica/formal: **Pendiente**.

Este ADR registra una decisión de frontera arquitectónica. No modifica código, Prisma, migraciones ni contratos existentes.
