# HU-05 — Error porcentual del modelo de oferta

## Finalidad y alcance

Documentar WAPE del modelo activo xm-gene-ridge@1.0.0 sobre el mismo holdout
temporal externo ya evaluado. Generación XM se usa como proxy técnico de
disponibilidad energética; no equivale a ofertas transaccionales observadas.
Este incremento aporta evidencia para HU-05, no implementa un endpoint.

Se utilizó exclusivamente el modelo productivo y los snapshots locales conservados.
Sin consultas XM/PostgreSQL, reentrenamiento, cambio de coeficientes o particiones.
trainedAt sigue no registrado: null, trainedAtStatus=not_recorded. Los rangos de
datos no son fecha/hora de entrenamiento. Validación académica/formal pendiente.

## Fuentes verificadas

- Modelo: [model.json](../../../backend/src/models/xm-gene-ridge/1.0.0/model.json), ridge, alpha=0.01.
- Historia: [CSV original](../hu-04-xm-gene/xm-gene-2024-01-01_2024-03-30.csv), 2160 filas.
- Holdout: [CSV externo](../hu-04-xm-gene/external-holdout/xm-gene-2024-03-31_2024-04-29.csv),
  2024-03-31..2024-04-29, 720 observaciones.

SHA-256 de historia:
`4c91a20048d90d082f8eec6c770f4bd042e479d70df7ca020e8dd3a6b3ba0177`.

SHA-256 de holdout:
`9fdb41321a46f2b027b3578ebb0eca9894100653644bff6401ae901aeced9182`.

Ambos coincidieron exactamente antes de calcular. El hash del archivo de modelo
leído se registra en metrics.json para identificar los bytes utilizados.

## Protocolo y condición previa

Origen diario antes del periodo 1, horizonte 24. Features congeladas:
D−1 mismo periodo, D−7 mismo periodo, periodo24 de D−1,
sin(2*pi*(h−1)/24) y cos(2*pi*(h−1)/24). Se aplican medias, desviaciones
poblacionales, coeficientes e intercepto productivos sin ajustarlos.

Las búsquedas usan claves calendario/periodo anteriores al día objetivo.
Días anteriores del holdout son historia disponible para orígenes posteriores;
no se utilizan observaciones del propio día objetivo. Se supone disponibilidad
completa del día anterior; no se verifica aquí latencia de publicación XM.
No se infieren timestamps.

Python 3.14.4, biblioteca estándar; float IEEE-754 y sumas math.fsum, sin
redondeo explícito. Se exigió diferencia absoluta < 1e-7 kWh para cada métrica
antes de calcular WAPE. Las tres diferencias fueron 0.

| Métrica reproducida | Resultado |
| --- | ---: |
| Evaluables | 720 |
| Indisponibles | 0 |
| MAE, kWh | 329144.1790612068 |
| RMSE, kWh | 438880.23646857974 |
| Bias, kWh | -17643.615971800806 |

Estas métricas ya existentes se reproducen como control y contexto; no son una
nueva evaluación independiente ni sirven para reseleccionar el modelo.

## WAPE

Se utiliza para expresar el error absoluto agregado relativo al volumen absoluto
observado del holdout fijo. No es MAPE ni sMAPE, que no se calcularon.

`WAPE = 100 * sum(abs(actual - prediction)) / sum(abs(actual))`

Todos los valores reales son finitos. El denominador se comprobó positivo.

| Componente | Valor sin redondeo explícito |
| --- | ---: |
| Numerador absoluto, kWh | 236983808.9240689 |
| Denominador absoluto, kWh | 6814119264.41 |
| WAPE, percent | 3.4778347681971216 |

Presentación redondeada: **3.4778 %**. La precisión completa indicada corresponde
al resultado float conservado, no a aritmética decimal exacta ilimitada.

WAPE es descriptivo de este holdout fijo; no demuestra generalización ni sustituye
MAE/RMSE. Su denominador depende del volumen del periodo; no acredita comparabilidad
entre periodos distintos ni representa una probabilidad o garantía de acierto.
No existe evaluación anual ni nueva selección de modelo en este paso.

## Reproducción

[metrics.json](metrics.json) registra resultados, hashes, protocolo, tolerancia y
ausencia de trainedAt. Ejecutar el siguiente script Python por stdin desde la raíz
en una copia donde hu-05-metricas/metrics.json no exista. La escritura exclusiva
evita sobrescribir evidencia previa. No crea ningún modelo ni modifica fuentes.

```python

import csv,json,hashlib,math,statistics,platform
from pathlib import Path
from datetime import date,timedelta
root=Path("docs/evidencias/hu-04-xm-gene")
trainHash="4c91a20048d90d082f8eec6c770f4bd042e479d70df7ca020e8dd3a6b3ba0177"
holdHash="9fdb41321a46f2b027b3578ebb0eca9894100653644bff6401ae901aeced9182"
modelPath=Path("backend/src/models/xm-gene-ridge/1.0.0/model.json")
modelBytes=modelPath.read_bytes();m=json.loads(modelBytes)
assert (m["modelId"],m["modelVersion"],m["modelType"],m["alpha"])==("xm-gene-ridge","1.0.0","ridge",0.01)
features=["energy_same_period_previous_day","energy_same_period_7_days_before","energy_period24_previous_day","sin_2pi_hour_minus1_over24","cos_2pi_hour_minus1_over24"]
assert m["orderedFeatures"]==features and m["horizonPeriods"]==24 and m["unit"]=="kWh"
assert m["trainingSnapshotSha256"]==trainHash
mf=json.loads((root/"external-holdout/manifest.json").read_text())
assert mf["snapshot"]["sha256"]==holdHash and mf["range"]==["2024-03-31","2024-04-29"]
assert m["evaluationSummary"]["holdoutSnapshotSha256"]==holdHash
data={}
for file,expected,n in [(root/"xm-gene-2024-01-01_2024-03-30.csv",trainHash,2160),(root/"external-holdout"/mf["snapshot"]["file"],holdHash,720)]:
 b=file.read_bytes();assert hashlib.sha256(b).hexdigest()==expected
 rows=list(csv.DictReader(b.decode("utf-8").splitlines()));assert len(rows)==n
 for r in rows:
  k=(r["fecha_xm"],int(r["hora_xm"]));v=float(r["energia_kwh"])
  assert k not in data and math.isfinite(v) and 1<=k[1]<=24
  data[k]=v
assert m["scaler"]["ddof"]==0
assert all(len(m["scaler"][k])==5 for k in ["means","standardDeviations"])
assert all(math.isfinite(x) for x in m["coefficients"]+m["scaler"]["means"]+[m["intercept"]])
assert all(math.isfinite(s) and s>0 for s in m["scaler"]["standardDeviations"])
errors=[];actuals=[];unavailable=0
for i in range(30):
 d=date(2024,3,31)+timedelta(days=i)
 for h in range(1,25):
  refs=[((d-timedelta(days=1)).isoformat(),h),((d-timedelta(days=7)).isoformat(),h),((d-timedelta(days=1)).isoformat(),24)]
  assert all(rd<d.isoformat() for rd,rh in refs)
  if any(k not in data for k in refs):unavailable+=1;continue
  x=[data[k] for k in refs]+[math.sin(2*math.pi*(h-1)/24),math.cos(2*math.pi*(h-1)/24)]
  predicted=m["intercept"]+math.fsum(c*(v-u)/s for c,v,u,s in zip(m["coefficients"],x,m["scaler"]["means"],m["scaler"]["standardDeviations"]))
  actual=data[d.isoformat(),h];assert math.isfinite(predicted) and math.isfinite(actual)
  errors.append(predicted-actual);actuals.append(actual)
assert len(errors)==720 and unavailable==0
reproduced=dict(MAE=statistics.fmean(abs(e) for e in errors),RMSE=math.sqrt(statistics.fmean(e*e for e in errors)),bias=statistics.fmean(errors))
reference=json.loads((root/"external-holdout/metrics.json").read_text())["results"]["Ridge"]
deltas={k:abs(reproduced[k]-reference[k]) for k in reproduced}
assert all(delta<1e-7 for delta in deltas.values()),deltas
assert all(abs(reproduced[k]-m["evaluationSummary"]["metrics"]["Ridge"][k])<1e-7 for k in reproduced)
# WAPE is computed only after successful reproduction gate.
numerator=math.fsum(abs(e) for e in errors);denominator=math.fsum(abs(y) for y in actuals)
assert denominator>0 and math.isfinite(denominator) and math.isfinite(numerator)
wape=100*numerator/denominator
result=dict(modelId=m["modelId"],modelVersion=m["modelVersion"],evaluation=dict(type="external_temporal_holdout",range=dict(start="2024-03-31",end="2024-04-29"),snapshotSha256=holdHash,evaluable=len(errors),unavailable=unavailable,**reproduced,percentageError=dict(metric="WAPE",value=wape,unit="percent",numeratorAbsoluteErrorKwh=numerator,denominatorAbsoluteActualKwh=denominator)),training=dict(trainedAt=None,trainedAtStatus="not_recorded",snapshotSha256=trainHash),reproducibility=dict(python=platform.python_version(),dependencies="standard library only",modelFile=str(modelPath).replace(chr(92),"/"),modelFileSha256=hashlib.sha256(modelBytes).hexdigest(),protocol="Daily origin before period 1; horizon 24; prior dates only; fixed model/scaler",formula="100 * sum(abs(actual-prediction)) / sum(abs(actual))",arithmetic="Python float IEEE-754; math.fsum aggregation; no explicit rounding",absoluteMetricToleranceKwh=1e-7,absoluteDifferencesFromRecordedMetrics=deltas))
out=Path("docs/evidencias/hu-05-metricas");out.mkdir(exist_ok=True)
with (out/"metrics.json").open("x",encoding="utf-8") as f:json.dump(result,f,indent=2,allow_nan=False);f.write("\n")
print(json.dumps(result))

```
