# HU-04 — Generar pronóstico de oferta energética

## Objetivo y estado

Permitir que el backend o un sistema externo solicite un pronóstico que apoye
la disponibilidad energética estimada en el escenario simulado.
La variable pronosticada es `energia_kwh`: generación XM usada como **proxy
técnico de disponibilidad**, no equivalente a oferta transaccional real observada.
La respuesta lo identifica como `generation_availability_proxy`.

| Dimensión | Estado |
| --- | --- |
| Inferencia y contrato backend HU-04 | Implementado |
| Pruebas automatizadas y paridad offline | Probado técnicamente |
| Express + PostgreSQL reales, sin escrituras | Probado técnicamente |
| Frontend HU-04 | No implementado |
| Evaluación anual y generalización fuera de los periodos evaluados | No acreditadas |
| Validación académica/formal | Pendiente |

## Modelo y corpus

Modelo `xm-gene-ridge@1.0.0`, Ridge alpha=0.01. Los parámetros completos del
experimento externo se promovieron al [artefacto del servidor](../../../backend/src/models/xm-gene-ridge/1.0.0/model.json).
Alpha fue seleccionado con validation; la evaluación externa mantuvo su
especificación congelada y comprobó la regla predefinida de candidatura.

Corpus de entrenamiento: [snapshot XM Gene](../hu-04-xm-gene/xm-gene-2024-01-01_2024-03-30.csv),
2024-01-01..2024-03-30, 2160 observaciones. SHA-256:

```text
4c91a20048d90d082f8eec6c770f4bd042e479d70df7ca020e8dd3a6b3ba0177
```

Entrenamiento efectivo: 1992 filas, 2024-01-08..2024-03-30; las primeras siete
fechas carecen de lag7. El holdout 2024-03-31..2024-04-29 no forma parte de ese
entrenamiento. Ver [experimento externo](../hu-04-xm-gene/external-holdout/README.md).
Esta evidencia documenta integración, no un nuevo entrenamiento ni evaluación anual.

## Protocolo y arquitectura

Origen diario antes del periodo 1 de D; horizonte fijo de 24 periodos XM.
Features en el orden congelado:

1. Energía de (D−1, h).
2. Energía de (D−7, h).
3. Energía de (D−1, 24), constante para el horizonte.
4. sin(2π(h−1)/24).
5. cos(2π(h−1)/24).

El escalado poblacional y los coeficientes se cargan desde ruta fija, se validan
una vez y se mantienen inmutables. El controlador valida JSON; el servicio lee
directamente PreparedDataset con Prisma, valida perfil/contenido, busca claves
fecha/periodo y calcula `intercept + Σ coefficient[j] × (x[j]−mean[j])/std[j]`.
No llama a preparación, no consulta XM y no entrena modelos en runtime.
No se infieren timestamps ni se usa sourceRecordIndex como feature.
No se redondean ni recortan predicciones negativas.

## Contrato HTTP

`POST /forecasts/supply`, Content-Type `application/json`, máximo 16 KiB.
Admite exclusivamente estas dos claves:

```json
{"preparedDatasetId":17,"targetDate":"2024-04-08"}
```

ID entero positivo y fecha calendario estricta YYYY-MM-DD, posterior al cierre
de entrenamiento (2024-03-30). Respuesta disponible HTTP 200:

```ts
{
  status: "available";
  preparedDatasetId: number;
  sourceDatasetId: number;
  forecastType: "generation_availability_proxy";
  target: "energia_kwh";
  unit: "kWh";
  horizonPeriods: 24;
  modelId: "xm-gene-ridge";
  modelVersion: "1.0.0";
  targetDate: string;
  predictions: Array<{ hora_xm: number; energia_kwh: number }>;
}
```

Exactamente 24 elementos ordenados 1..24, todos finitos. Historia insuficiente:

```json
{"status":"unavailable","error":"FORECAST_DATA_INSUFFICIENT","message":"No hay datos históricos suficientes para pronosticar el día solicitado."}
```

HTTP 422, sin resultados parciales. Otros errores seguros: 400 solicitud inválida;
404 preparado inexistente; 422 perfil incompatible o fecha no soportada;
409 modelo incompatible o preparado inconsistente; 500 fallo interno.
El parser contempla 413 por tamaño y 415 por tipo/codificación no admitidos.

## Limitaciones

- D−1 y D−7 completos deben estar dentro del **mismo PreparedDataset** compatible
  con xm_gene_preparacion_base@1.0.0 y xm_gene_base@1.0.0. No se unen bloques automáticamente.
- Se supone disponibilidad completa del día anterior; latencia de publicación XM no verificada.
- No se imputan ausencias. Las predicciones no se persisten.
- Registros del día objetivo/futuros no se usan como features; el contenido completo
  sí se valida y la corrupción o duplicados provocan rechazo.
- Sin frontend HU-04, sin evaluación anual ni afirmación de generalización fuera
  de los periodos evaluados. Validación académica/formal pendiente.

[Pruebas y resultados reales](pruebas.md) · [ADR-09](../../adr/ADR-09-inferencia-hu04-ridge-versionado.md).
