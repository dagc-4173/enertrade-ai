# C7a — Cierre de la investigación de viabilidad PV

## Estado

- Investigación PV: **Investigada**.
- Provider meteorológico NASA POWER: **Implementado** como infraestructura meteorológica.
- Adquisición meteorológica reproducible: **Implementada**.
- Dataset PV supervisado: **No implementado**.
- Modelo PV: **No implementado**.
- Integración PV con EnerTrade AI: **No implementada**.
- Línea PV futura: **Pendiente futuro**.

Este documento cierra la línea exploratoria C5/C6 con base en consultas oficiales y no constituye evidencia de un modelo fotovoltaico ni de una HU completada.

## Objetivo y alcance

La investigación evaluó si era posible cerrar un target real de generación fotovoltaica y alinearlo con variables meteorológicas para un futuro pipeline PV. No se entrenó ningún modelo, no se creó un dataset permanente, no se modificó Prisma y no se importaron datos a `EnergyDataset`.

La decisión de frontera entre adquisiciones meteorológicas y datasets energéticos está formalizada en [ADR-15](../../adr/ADR-15-frontera-weather-acquisition-datasets-energeticos.md). Este documento registra resultados experimentales, no reemplaza ese ADR.

## XM — C5

### Recursos solares

La consulta oficial XM `ListadoRecursos` identificó, entre otros, estos recursos:

| Código | Nombre | Tipo | Fuente | Agente | Inicio operación | Estado |
|---|---|---|---|---|---|---|
| `3EFY` | BOSQUES SOLARES DE LOS LLANOS 4 | `SOLAR` | `RAD SOLAR` | `ISGG` | `2022-09-12` | `OPERACION` |
| `3EDL` | BOSQUES SOLARES DE LOS LLANOS 5 | `SOLAR` | `RAD SOLAR` | `ISGG` | `2022-09-12` | `OPERACION` |

### Métricas verificadas

El catálogo oficial `ListadoMetricas` expuso:

- `Gene`: Generación por Recurso, `HourlyEntities`, `kWh`, máximo 31 días. La descripción indica generación neta de plantas en sus puntos de frontera.
- `CapEfecNeta`: Capacidad Efectiva Neta por Recurso, `DailyEntities`, `kW`.
- `IrrGlobal`: Irradiación Global por Recurso, `DailyEntities`, `W/m2`.
- `IrrPanel`: Irradiación Panel por Recurso, `DailyEntities`, `W/m2`.
- `TempAmbSolar`: Temperatura Ambiente Solar por Recurso, `DailyEntities`, `°C`.

### Resultado del target diario

Para `3EFY`, en `2024-04-01` a `2024-04-07`, `Gene` devolvió:

- 168 slots horarios esperados;
- 84 valores numéricos;
- 84 valores vacíos;
- 12 valores numéricos por día.

Se observaron vacíos en periodos como `Hour01` y `Hour24`. La documentación oficial consultada no define que un campo vacío equivalga a cero, ni distingue de forma suficiente entre cero, ausencia de generación y dato no reportado.

No existe una métrica diaria oficial de generación real por recurso que sustituya a `Gene`. Las métricas diarias similares encontradas son capacidad efectiva neta, energía firme, obligaciones o variables contractuales, no producción diaria observada.

Aunque la unidad de `Gene` es `kWh`, no se adoptó la regla de sumar únicamente los valores numéricos porque dejaría implícita una imputación de los vacíos.

### CEN y control exploratorio

Para `3EFY`:

```text
CapEfecNeta = 19900 kW
```

Para `3EDL`:

```text
CapEfecNeta = 17900 kW
```

En la ventana consultada, los valores de CEN fueron constantes por fecha. El máximo horario observado de `Gene` fue aproximadamente `19893.78 kWh` para `3EFY` y `17907.99 kWh` para `3EDL`. Esto es únicamente un control exploratorio; no resuelve la semántica de faltantes ni convierte Gene en un target diario válido.

### Resultado XM

XM aporta recursos solares identificables, generación horaria por recurso y CEN, pero no se cerraron simultáneamente:

- target diario reproducible;
- significado oficial de los vacíos;
- semántica `Hour01..Hour24` a UTC;
- ubicación exacta del recurso;
- alineación temporal suficiente para meteorología externa.

Resultado de la línea XM: **APTO CON LIMITACIONES para continuar investigación; NO-GO para dataset PV supervisado**.

## PVDAQ — C6

### Fuente oficial

Fuente: NREL/Open Energy Data Initiative, **Photovoltaic Data Acquisition (PVDAQ) Public Datasets**.

- DOI: `10.25984/1846021`.
- Autores: Chris Deline, Kirsten Perry, Michael Deceglie, Matthew Muller, William Sekulic y Dirk Jordan.
- Organización: NREL.
- Fecha de datos: 21 de diciembre de 2021.
- Última actualización indicada por OEDI: 31 de julio de 2025.
- Acceso: público.
- Licencia declarada en la ficha específica: Creative Commons Attribution 4.0.
- El registro general del data lake OEDI menciona Creative Commons Attribution 3.0 United States; esta diferencia debe revisarse antes de redistribuir archivos.

### Sistema investigado

```text
system_id: 2105
public_name: Maui Ocean Center
site_id: 7209
location: Maui, HI
latitude: 20.79253
longitude: -156.5120
elevation: 10 m
DC capacity: 110 kW
first timestamp: 2018-12-15 00:15
last timestamp: 2023-11-15 12:21
data resolution: 5-15 min
```

El metadata Prize reporta 57 canales y tamaño aproximado de 199 MB. El CSV consolidado de sistemas reporta 71 canales, 15.8 millones de registros y 361.86 MB. Se conservaron ambas observaciones; no se asumió que sean exactamente la misma vista/versionado.

### Target y features

Target investigado:

```text
metric_id: 150176
sensor: inv_STRING04_ac_output (kWh)
common_name: AC energy
units: kWh
source_type: INVERTER
aggregation_type: sample
calc_scale: 1.0
calc_offset: 0.0
offline: false
```

Features verificadas:

```text
metric_id: 150217
common_name: Irradiance GHI
units: W/m^2
aggregation_type: avg
source_type: OTHER
```

```text
metric_id: 150216
common_name: Temperature ambient
units: C
aggregation_type: avg
source_type: OTHER
```

También existen métricas POA por string, pero no se incorporaron al cierre.

### Muestra empírica

En `2019-04-02`:

- target del inversor 4: 146 registros;
- irradiancia: 96 registros;
- temperatura: 96 registros;
- matches exactos por `measured_on`: 21;
- cobertura exacta del target: aproximadamente 14.38%;
- target nulo/vacío: 3 registros;
- target negativo: 0;
- target cero: 3;
- duplicados observados en el día: 0.

En `2019-04-01` a `2019-04-07`:

- target: 899 registros;
- irradiancia: 672 registros;
- temperatura: 672 registros;
- matches exactos: 109;
- cobertura exacta del target: aproximadamente 12.12%;
- el primer día de la ventana no tuvo registros del target seleccionado.

### Limitaciones PVDAQ

- Los archivos Prize usados contienen `measured_on`, pero no `utc_measured_on`.
- La documentación canónica define `utc_measured_on`, pero no se obtuvo una partición canónica verificable para `system_id = 2105` en esta investigación.
- La frecuencia real varía entre 5 y 15 minutos.
- El target seleccionado es AC energy de un inversor, no producción agregada del sistema completo.
- `aggregation_type = sample` no permite cerrar por sí solo si el valor es energía por intervalo, contador o lectura instrumentada.
- El join exacto tiene baja cobertura.
- No se adoptaron redondeo a 15 minutos, nearest ni agregación horaria porque la semántica UTC y energética no estaba cerrada.

Resultado PVDAQ: **APTO CON LIMITACIONES como fuente experimental; NO-GO para entrenar todavía**.

## Justificación del NO-GO

El NO-GO no significa que no existan datos. Ambas fuentes contienen piezas útiles:

- XM contiene recursos solares, CEN y generación por recurso.
- PVDAQ contiene sistemas PV reales, metadata de sitio, capacidad y canales de desempeño.
- PVDAQ contiene sensores de irradiancia y temperatura.

El NO-GO se debe a que no fue posible cerrar simultáneamente:

- target reproducible con semántica completa;
- timestamps UTC verificables para la muestra PVDAQ Prize;
- ubicación y alineación XM–meteorología para recursos colombianos;
- target agregado de sistema;
- cobertura suficiente del join;
- reglas de preparación defendibles.

No se atribuye el resultado a un fallo de XM, PVDAQ o NASA POWER. La conclusión es de alcance y evidencia disponible.

## Decisión y estado

| Capacidad | Estado |
|---|---|
| Investigación de XM solar | Investigada |
| Investigación de PVDAQ | Investigada |
| Provider NASA POWER | Implementado |
| Adquisición meteorológica reproducible | Implementada |
| Dataset PV supervisado | No implementado |
| Modelo PV | No implementado |
| Integración PV con EnerTrade AI | No implementada |
| Línea PV futura | Pendiente futuro |

La investigación no modifica objetivos aprobados, no elimina capacidades existentes y no afecta los modelos actuales de generación XM, demanda agregada o precio determinístico. Evita añadir una capacidad PV no sustentada y reduce riesgo técnico y académico.

## Relación con decisiones y HU

- C2: adquisición, normalización, hashes, manifest, envelope, replay y store meteorológico.
- C3: consulta y adquisición HTTP de meteorología.
- ADR-14: reproducibilidad de adquisiciones meteorológicas.
- ADR-15: separación entre `WeatherAcquisition` y `EnergyDataset`.
- HU-04/HU-05: generación XM y sus métricas, sin convertir la investigación PV en una ampliación de HU-04.
- HU-18: versionado y trazabilidad de providers y artefactos.

Ninguna HU se marca como completada por esta investigación.

## Evidencias que deben conservarse

- Consultas XM y fecha de acceso.
- Códigos `3EFY` y `3EDL`.
- Respuestas resumidas de `ListadoRecursos` y `ListadoMetricas`.
- CEN: `19900 kW` para `3EFY` y `17900 kW` para `3EDL`.
- Conteos Gene: 168 slots, 84 numéricos y 84 vacíos por recurso en la ventana de siete días.
- DOI PVDAQ `10.25984/1846021`.
- Metadata del sistema PVDAQ 2105.
- IDs de métricas PVDAQ 150176, 150217 y 150216.
- Resultados de join exacto y cobertura aproximada.
- Razones documentadas del NO-GO.

No deben conservarse payloads grandes completos en Git.

## Uso en Trabajo de Grado II

La investigación puede documentarse en:

- desarrollo/resultados: auditoría de fuentes y viabilidad de datos;
- decisiones técnicas: relación con ADR-14 y ADR-15;
- limitaciones: target, UTC, cobertura y ubicación;
- trabajo futuro: cierre de target/alineación y eventual experimento PV.

No se modifica `Trabajo de grado II.docx` mediante este cierre.

## Uso de IA

ChatGPT/Copilot apoyó:

- exploración técnica del repositorio;
- diseño de criterios de viabilidad;
- análisis de contratos XM, PVDAQ y NASA POWER;
- formulación de comprobaciones y criterios GO/NO-GO;
- síntesis de resultados para trazabilidad documental.

Los resultados reportados se basaron en lectura del código real, consultas oficiales XM/SINERGOX y consultas/documentación oficial NREL/OEDI/PVDAQ. El uso de IA no se presenta como evidencia independiente ni como cumplimiento administrativo.

## Trabajo futuro

Antes de un modelo PV experimental se requiere:

1. cerrar el acceso canónico PVDAQ para `system_id = 2105`;
2. verificar `utc_measured_on` real;
3. resolver la semántica de `AC energy` y su `aggregation_type`;
4. determinar si existe target agregado de sistema;
5. definir una alineación temporal reproducible;
6. establecer umbral de cobertura y política de faltantes;
7. crear un dataset experimental separado, sin incorporarlo automáticamente a `EnergyDataset`.

Hasta completar esas condiciones, no se debe entrenar ni registrar un modelo PV.
