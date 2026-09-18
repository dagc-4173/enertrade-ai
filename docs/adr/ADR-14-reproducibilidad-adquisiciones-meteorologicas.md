# ADR-14 — Conservar adquisiciones meteorológicas reproducibles sin modificar el contrato público WeatherDataProvider

**Estado:** Propuesto para diseño técnico.

## Contexto

La FASE C1 necesita conservar evidencia reproducible de adquisiciones meteorológicas sin romper el contrato público de los providers. El contrato `WeatherDataProvider` debe mantenerse mínimo y `WeatherDataResult` representa datos normalizados, no snapshots crudos.

El provider actual de NASA POWER combina adquisición HTTP, parsing y normalización en un mismo flujo:

```text
fetch
  -> response.json()
  -> parsing
  -> normalización
  -> WeatherDataResult
```

Al convertir directamente la respuesta mediante `response.json()`, el cuerpo textual recibido se pierde. No debe realizarse una segunda request únicamente para producir evidencia: además de ser innecesario, podría devolver datos diferentes y romper la correspondencia entre la predicción y la evidencia.

Se necesita un mecanismo que permita:

- conservar un raw snapshot;
- reproducir la normalización sin red;
- calcular hashes verificables;
- vincular raw, normalized y manifest;
- reutilizar la estrategia con futuros providers;
- evitar que snapshots contengan secretos.

En este ADR, `raw snapshot` significa el texto de la respuesta HTTP decodificado como UTF-8, capturado antes del parsing y la normalización. No se afirma que represente los bytes exactos del transporte HTTP.

La decisión se relaciona con la integración meteorológica, la reproducibilidad de datasets, la futura preparación PV y las etapas HU-01, HU-02, HU-03 y HU-18. No modifica Prisma, migraciones, frontend ni el provider actual en este documento.

## Alternativas consideradas

### Alternativa A — Añadir raw a WeatherDataResult

Incluir el body original dentro de `WeatherDataResult` permitiría transportarlo junto con los datos normalizados. Se descarta porque contamina el contrato público, aumenta el tamaño de las respuestas y mezcla datos operativos con evidencia de adquisición.

### Alternativa B — AcquisitionEnvelope genérico

Crear un envelope que agrupe `raw`, `normalized` y `manifest` separaría la evidencia del resultado público y sería reutilizable entre providers. Requiere una capa adicional y una forma controlada de obtener el raw sin realizar una segunda request.

### Alternativa C — Callback o hook de captura

Un callback del provider podría recibir el body antes de normalizarlo. Reduce la superficie inicial, pero acopla la captura de evidencia a callbacks opcionales, dificulta razonar sobre si siempre se capturó el body y mezcla responsabilidades del provider con almacenamiento o hashing.

### Alternativa D — WeatherAcquisitionService sobre el provider sin modificarlo

Una capa superior podría construir manifests a partir del `WeatherDataResult`, pero no podría recuperar el raw que el provider ya descartó. Realizar otra request sería incorrecto porque la respuesta podría cambiar y no sería una adquisición única.

### Alternativa E — Separación interna de adquisición y normalización con envelope de evidencia

Separar la adquisición HTTP de la normalización permite capturar una única respuesta, reproducir el normalizador y mantener la proyección pública actual. Añade una capa interna y exige canonicalización versionada, pero ofrece la mejor combinación de compatibilidad, testabilidad y replay.

## Decisión

Se adopta la Alternativa E, complementada con un envelope de evidencia como el de la Alternativa B.

1. Mantener `WeatherDataProvider` sin cambios.
2. Separar internamente adquisición HTTP y parsing/normalización.
3. Capturar una única respuesta HTTP como `rawBody`.
4. Mantener la operación pública:

   ```ts
   query(query): Promise<WeatherDataResult>
   ```

5. Permitir que el flujo de evidencia produzca conceptualmente un `WeatherAcquisitionEnvelope` con raw snapshot, normalized snapshot y manifest.
6. Usar SHA-256 mediante APIs nativas de Node, sin dependencias externas.
7. Calcular `rawSha256` sobre la representación UTF-8 de `rawBody`.
8. Calcular `normalizedSha256` sobre JSON canónico estable.
9. Excluir del hash normalizado `retrievedAt`, `acquisitionId`, tiempos de ejecución, headers, datos de transporte y metadata volátil.
10. Mantener `null` y `0` como valores distintos.

El provider público continuará entregando solamente datos normalizados. La evidencia no se añadirá obligatoriamente a cada respuesta pública.

## Identidad y hashes

`acquisitionId` identifica el evento de adquisición y debe ser independiente del contenido. Se recomienda UUID para identificar cada evento.

Los hashes identifican contenido:

- `rawSha256`: hash del raw snapshot.
- `normalizedSha256`: hash del normalized snapshot.

Dos adquisiciones pueden tener `acquisitionId` diferentes y hashes iguales si recibieron contenido idéntico. La convención recomendada para ambos hashes es:

```text
sha256:<hexadecimal SHA-256 en minúsculas>
```

El `acquisitionId` no se incluye en el normalized hash.

## Canonicalización del normalized snapshot

La representación canónica deberá cumplir como mínimo:

- claves de objetos ordenadas lexicográficamente;
- arrays con su orden semántico preservado;
- observations ordenadas por `timestampUtc`;
- variables solicitadas ordenadas cuando su orden no sea significativo;
- `null` preservado;
- `0` preservado;
- `undefined` rechazado;
- números finitos únicamente;
- strings serializados con la representación JSON estándar.

No se afirma conformidad con RFC o estándar externo de canonical JSON. Se trata de una canonicalización propia, explícita y versionada.

El normalized snapshot debe ser independiente de valores generados en runtime. Como base conceptual contendrá:

```text
provider
query
observations
units
sourceTimeStandard
normalizer
```

`responseMetadata` no entra inicialmente en el normalized hash porque puede contener información volátil de transporte o de la respuesta. Si posteriormente se demuestra que una parte es semánticamente necesaria, deberá convertirse en un campo estable y versionado.

## WeatherAcquisitionManifest

La estructura conceptual propuesta es:

```text
acquisitionId
providerId
providerVersion
logicalEndpoint
retrievedAt
coordinates
requestedRange
requestedVariables
requestedTimeStandard
sourceTimeStandard
sourceUnits
canonicalUnits
normalizerId
normalizerVersion
rawSha256
normalizedSha256
rawMediaType
recordCount
status
```

Son obligatorios la identidad del provider, endpoint lógico, momento de adquisición, query, estándares temporales, normalizador, hashes, media type, cantidad de observaciones y estado. `sourceUnits`, `canonicalUnits` y detalles no sensibles de respuesta pueden ser opcionales según el provider.

El manifest no incluirá tokens, passwords, cookies, headers de Authorization ni URLs completas con secretos.

## Replay

Replay se define como:

```text
rawBody almacenado
  -> normalizador de la versión indicada
  -> normalized snapshot
  -> canonicalización
  -> SHA-256
  -> comparación contra normalizedSha256 del manifest
```

El replay no realiza llamadas a Internet, no usa una segunda request ni requiere credenciales. Debe detectar un raw alterado y debe conservar la trazabilidad de la versión del normalizador. Un cambio de `normalizerVersion` debe quedar registrado aunque produzca el mismo resultado numérico.

La separación de adquisición y normalización es necesaria porque el provider actual mezcla HTTP y normalización y hoy no permite replay limpio.

## Persistencia futura

La persistencia se difiere.

Para el MVP y Trabajo de Grado II:

- snapshots pequeños y manifests pueden conservarse como evidencia local;
- los archivos deben estar relacionados mediante hashes y manifest;
- no se deben subir históricos grandes a Git.

Para una evolución futura se recomienda un esquema híbrido:

- índice y manifest en PostgreSQL;
- raw y normalized snapshots en filesystem controlado u object storage.

Este ADR no modifica Prisma ni crea migraciones.

## Relación con EnergyDataset

El flujo futuro será:

```text
adquisición meteorológica
  -> raw snapshot
  -> normalized snapshot
  -> manifest
  -> posterior importación
  -> EnergyDataset o perfil de dataset PV
```

Una adquisición meteorológica no se convertirá automáticamente en `EnergyDataset`. La importación posterior deberá conservar `acquisitionId`, hashes, provider, versión del normalizador, rango, coordenadas y perfil aplicado.

El campo textual `source` actual no debe sobrecargarse con toda la provenance. La relación estructurada o metadata versionada se decidirá en una fase posterior, sin modificar Prisma mediante este ADR.

## Seguridad

Los snapshots y manifests futuros deberán:

- excluir headers HTTP;
- excluir `Authorization`;
- excluir cookies;
- excluir tokens y credenciales;
- evitar URLs completas innecesarias;
- aplicar límites de tamaño;
- impedir path traversal si se usa filesystem;
- evitar nombres de archivo derivados directamente de input del usuario;
- tratar cuidadosamente coordenadas precisas, que pueden revelar la ubicación de activos;
- proteger el acceso a raw snapshots;
- mantener errores controlados sin body upstream ni stack trace.

El raw debe capturarse únicamente del endpoint permitido del provider. La conservación del raw no autoriza a persistir secretos que aparezcan accidentalmente en capas de transporte.

## Consecuencias positivas

- Replay sin red.
- Trazabilidad entre adquisición, normalización y evidencia.
- Una única request al proveedor.
- Compatibilidad con el contrato público existente.
- Reutilización futura con PVGIS, IDEAM u otros providers.
- Hashes verificables para revisión técnica y académica.
- Separación entre datos operativos y snapshots de evidencia.

## Costes / deuda

- Nueva capa de adquisición y evidencia.
- Canonicalización propia que debe mantenerse y versionarse.
- Gestión futura de snapshots y manifests.
- Necesidad de controlar tamaños, permisos y retención.
- El raw textual no representa los bytes exactos del transporte HTTP.
- La implementación deberá mantener sincronizadas identidad de provider, provenance y manifest.
- No existe todavía replay implementado.
- No existe todavía persistencia de manifests ni snapshots.

## Estado de implementación

- ADR: **Propuesto para diseño técnico**.
- Separación adquisición/normalización: **Pendiente**.
- WeatherAcquisitionEnvelope: **Pendiente**.
- Hash raw: **Pendiente**.
- Hash normalized: **Pendiente**.
- Canonical JSON: **Pendiente**.
- Replay: **Pendiente**.
- Persistencia: **Pendiente**.
- Validación académica/formal: **Pendiente**.

Este ADR registra una decisión arquitectónica propuesta. No constituye evidencia de implementación, pruebas, persistencia, replay ni integración con EnergyDataset.

## Trazabilidad y límites

- Integración meteorológica: adquisición y normalización versionadas.
- Reproducibilidad de datasets: vínculo entre raw, normalized y manifest.
- Futura preparación PV: uso de snapshots normalizados y perfiles versionados.
- HU-01: registro posterior de datasets derivados.
- HU-02: validación posterior de datasets meteorológicos o PV.
- HU-03: preparación posterior y conservación de transformaciones.
- HU-18: versionado de providers, normalizadores, perfiles y artefactos.

HU-01, HU-02, HU-03 y HU-18 no se marcan como completadas por este ADR. La implementación del provider NASA POWER existente tampoco se modifica mediante esta decisión.
