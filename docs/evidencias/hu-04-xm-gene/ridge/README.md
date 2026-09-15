# HU-04 ? Ridge experimental

## Objetivo y alcance

Comparar un primer candidato entrenable con B7, seleccionado previamente. XM Gene es un proxy t?cnico de generaci?n/disponibilidad energ?tica para un escenario simulado; no equivale a ofertas transaccionales observadas. No se implementa HU-04 ni un endpoint. Validaci?n acad?mica/formal pendiente.

Fuente exclusiva: [CSV congelado](../xm-gene-2024-01-01_2024-03-30.csv).
SHA-256 verificado antes de calcular: `4c91a20048d90d082f8eec6c770f4bd042e479d70df7ca020e8dd3a6b3ba0177`.
2160 registros ?nicos, 90 fechas completas, 24 periodos por fecha. Sin consultas XM/PostgreSQL.

## Protocolo y leakage

TRAIN: 2024-01-01..2024-02-29; VALIDATION: 2024-03-01..2024-03-15; TEST: 2024-03-16..2024-03-30. Particiones fijas.

Origen diario antes del periodo 1; horizonte de 24 periodos. Toda feature energ?tica se busca por clave fecha/periodo anterior al d?a objetivo. No se usa el periodo anterior del propio d?a objetivo. Se supone que el d?a anterior completo ya est? disponible; la latencia de publicaci?n de XM no est? verificada. Se actualiza la historia conocida entre or?genes diarios sin reajustar el modelo. No se generan timestamps: la aritm?tica de calendario solo identifica fechas.

Features, en orden:
1. Energ?a del mismo periodo del d?a anterior.
2. Energ?a del mismo periodo siete d?as antes.
3. Energ?a del periodo 24 del d?a anterior, constante para el horizonte diario.
4. sin(2*pi*(hora_xm-1)/24).
5. cos(2*pi*(hora_xm-1)/24).

Sin d?a de semana, clima, precios ni demanda. Seno/coseno representan un ciclo de 24 etiquetas de periodo como elecci?n experimental; no asignan horas UTC/local.

## Ajuste reproducible

Python CPython 3.14.4, biblioteca est?ndar exclusivamente; sin dependencias instaladas. Ridge resuelta por Cholesky de una matriz 5x5:
min sum((y-intercept-X_scaled*beta)^2) + alpha*sum(beta^2).
Intercepto sin penalizaci?n. Se comprob? residual relativo de las ecuaciones normales < 1e-10 para todos los alpha. No sustituye una validaci?n futura contra una implementaci?n de referencia.

1272 filas efectivas de entrenamiento, 2024-01-08..2024-02-29. Las primeras 168 filas (7 d?as) no tienen lag7 en el snapshot y se excluyen, sin imputar.
Medias y desviaciones poblacionales (ddof=0) ajustadas exclusivamente sobre esas 1272 filas TRAIN; par?metros exactos en [model.json](model.json). No se ajusta nada con validation/test y no se reentrena con train+validation.

Alpha predefinidos: [0.01, 0.1, 1, 10, 100]. Selecci?n por menor MAE validation (menor alpha en empate). Antes de calcular se fij? mejora clara como reducci?n de MAE >= 5% respecto a B7 validation.

MAE = mean(abs(prediction-actual)).
RMSE = sqrt(mean((prediction-actual)^2)).
Bias = mean(prediction-actual).
Sin redondeo expl?cito en c?lculo; tablas redondeadas a dos decimales, unidades kWh.

## Validation por alpha

| Alpha | Evaluables | Indisponibles | MAE | RMSE | Bias |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0.01 | 360 | 0 | 204670.39 | 267049.29 | -1651.15 |
| 0.1 | 360 | 0 | 204681.31 | 267077.73 | -1715.67 |
| 1 | 360 | 0 | 204791.04 | 267365.18 | -2356.55 |
| 10 | 360 | 0 | 206086.48 | 270495.14 | -8372.66 |
| 100 | 360 | 0 | 228444.42 | 307118.66 | -46094.32 |

## Selecci?n y test final

Alpha seleccionado: **0.01**. Reducci?n MAE validation frente a B7: **13.52%**. Cumple el umbral predefinido y puede considerarse candidato principal experimental por ese criterio. La decisi?n se congel? antes de evaluar test una sola vez; no se ampli? la b?squeda aunque el alpha ganador est? en el extremo inferior.

| Partici?n | M?todo | MAE | RMSE | Bias |
| --- | --- | ---: | ---: | ---: |
| validation | B7 | 236660.34 | 278936.66 | -227919.06 |
| validation | Ridge | 204670.39 | 267049.29 | -1651.15 |
| test | B7 | 515943.76 | 806030.32 | 449211.62 |
| test | Ridge | 545400.28 | 739546.66 | 515393.59 |

Ridge test: 360 evaluables, 0 indisponibles. Mayor MAE que B7 y menor RMSE; sesgo positivo notable. No demuestra superioridad general ni se cambia la decisi?n utilizando test. B7 permanece como referencia comparativa.

## MAE/RMSE por periodo del modelo seleccionado

15 evaluables y 0 indisponibles por periodo en ambas particiones. Todas las m?tricas por periodo de cada alpha tambi?n est?n en metrics.json.

| Periodo | Validation MAE | Validation RMSE | Test MAE | Test RMSE |
| --- | ---: | ---: | ---: | ---: |
| 1 | 122908.05 | 157087.40 | 340058.82 | 380692.45 |
| 2 | 140004.80 | 174939.04 | 358042.90 | 393201.65 |
| 3 | 146009.94 | 180948.00 | 392156.92 | 436613.57 |
| 4 | 172503.86 | 201561.40 | 393726.97 | 418544.47 |
| 5 | 156927.56 | 181562.16 | 422092.06 | 453505.26 |
| 6 | 135070.94 | 173179.39 | 494008.42 | 586893.40 |
| 7 | 200809.57 | 233878.07 | 598864.26 | 729109.85 |
| 8 | 196316.38 | 242430.39 | 569145.69 | 729860.69 |
| 9 | 215281.37 | 277765.53 | 537661.29 | 735457.76 |
| 10 | 193373.05 | 268481.90 | 548849.12 | 757173.31 |
| 11 | 185690.67 | 256336.77 | 603901.34 | 813515.39 |
| 12 | 188602.16 | 264559.02 | 606849.44 | 843497.58 |
| 13 | 201135.80 | 254417.00 | 637705.57 | 847762.99 |
| 14 | 208233.67 | 275815.24 | 722014.24 | 938399.07 |
| 15 | 218295.13 | 306938.43 | 801106.38 | 1046936.72 |
| 16 | 230970.88 | 314302.99 | 856168.81 | 1120375.02 |
| 17 | 250453.89 | 328690.52 | 894347.75 | 1150791.97 |
| 18 | 266959.61 | 325086.85 | 865781.01 | 1045032.73 |
| 19 | 213607.38 | 248844.44 | 572849.82 | 764246.28 |
| 20 | 295284.95 | 355486.59 | 457787.82 | 666190.03 |
| 21 | 322251.65 | 396306.78 | 416114.68 | 615759.24 |
| 22 | 282072.31 | 339081.60 | 349200.09 | 502916.16 |
| 23 | 202559.76 | 268993.82 | 327499.35 | 417459.43 |
| 24 | 166765.99 | 203344.48 | 323674.07 | 397213.01 |

## Inferencia y par?metros

Artefacto exclusivamente **experimental**, no productivo. Coeficientes aplicados a features estandarizadas en el orden declarado: prediction = intercept + sum(coefficients[j] * (features[j]-means[j])/standardDeviations[j]).

```json
{
  "modelType": "Ridge",
  "modelVersion": "experimental-0.1.0",
  "alpha": 0.01,
  "features": [
    "energy_same_period_previous_day",
    "energy_same_period_7_days_before",
    "energy_period24_previous_day",
    "sin_2pi_hour_minus1_over24",
    "cos_2pi_hour_minus1_over24"
  ],
  "coefficients": [
    -17652.609854017493,
    718835.0573670994,
    161998.70504465618,
    -269362.4898901153,
    -224797.52473552682
  ],
  "intercept": 9468452.497248428,
  "scaling": {
    "method": "z-score; population standard deviation ddof=0; fitted only on usable TRAIN rows",
    "means": [
      9435405.450212264,
      9354893.244300315,
      8969031.337358491,
      -1.3401022080638637e-17,
      -5.598791695843364e-17
    ],
    "standardDeviations": [
      1097352.5863783725,
      1126690.6115279328,
      294323.00826671877,
      0.7071067811865476,
      0.7071067811865476
    ]
  },
  "trainedRange": "2024-01-08..2024-02-29",
  "snapshotSha256": "4c91a20048d90d082f8eec6c770f4bd042e479d70df7ca020e8dd3a6b3ba0177"
}
```

## Limitaciones

Noventa d?as y una sola partici?n no acreditan generalizaci?n fuera del periodo. La codificaci?n c?clica y disponibilidad al origen son hip?tesis expl?citas. El solver propio tiene comprobaciones algebraicas, pero no comparaci?n independiente con una librer?a Ridge. No se prueban modelos productivos, ni se declara implementada HU-04. El test ya qued? observado: experimentos posteriores no deben tratarlo como test nuevo e independiente.

## Reproducci?n

Ejecutar el siguiente Python por stdin desde la ra?z en una copia donde ridge/metrics.json y ridge/model.json no existan. Usa escritura exclusiva para no sobrescribir evidencia. El benchmark se lee de baselines/metrics.json; el corpus de entrenamiento procede ?nicamente del CSV.

```python

import csv,hashlib,json,math,statistics,sys,platform
from pathlib import Path
from datetime import date,timedelta
root=Path("docs/evidencias/hu-04-xm-gene")
sha="4c91a20048d90d082f8eec6c770f4bd042e479d70df7ca020e8dd3a6b3ba0177"
assert hashlib.sha256((root/"xm-gene-2024-01-01_2024-03-30.csv").read_bytes()).hexdigest()==sha
rows=list(csv.DictReader((root/"xm-gene-2024-01-01_2024-03-30.csv").open(encoding="utf-8")))
data={(r["fecha_xm"],int(r["hora_xm"])):float(r["energia_kwh"]) for r in rows}
assert len(rows)==len(data)==2160
assert len(set(d for d,h in data))==90
for i in range(90):
 d=(date(2024,1,1)+timedelta(days=i)).isoformat()
 for h in range(1,25): assert (d,h) in data and math.isfinite(data[d,h])
features=["energy_same_period_previous_day","energy_same_period_7_days_before","energy_period24_previous_day","sin_2pi_hour_minus1_over24","cos_2pi_hour_minus1_over24"]
def build(start,end):
 out=[];missing=0
 d=date.fromisoformat(start)
 while d<=date.fromisoformat(end):
  for h in range(1,25):
   refs=[((d-timedelta(days=1)).isoformat(),h),((d-timedelta(days=7)).isoformat(),h),((d-timedelta(days=1)).isoformat(),24)]
   assert all(rd<d.isoformat() for rd,rh in refs)
   if any(k not in data for k in refs):missing+=1;continue
   x=[data[k] for k in refs]+[math.sin(2*math.pi*(h-1)/24),math.cos(2*math.pi*(h-1)/24)]
   out.append((d.isoformat(),h,x,data[d.isoformat(),h]))
  d+=timedelta(days=1)
 return out,missing
train,train_missing=build("2024-01-01","2024-02-29")
val,val_missing=build("2024-03-01","2024-03-15")
assert len(train)==1272 and train_missing==168
p=len(features)
means=[statistics.fmean(r[2][j] for r in train) for j in range(p)]
scales=[statistics.pstdev(r[2][j] for r in train) for j in range(p)]
assert all(s>0 for s in scales)
z=[[(r[2][j]-means[j])/scales[j] for j in range(p)] for r in train]
ym=statistics.fmean(r[3] for r in train)
yc=[r[3]-ym for r in train]
def fit(alpha):
 a=[[math.fsum(row[i]*row[j] for row in z)+(alpha if i==j else 0) for j in range(p)] for i in range(p)]
 b=[math.fsum(row[i]*y for row,y in zip(z,yc)) for i in range(p)]
 l=[[0.0]*p for _ in range(p)]
 for i in range(p):
  for j in range(i+1):
   v=a[i][j]-math.fsum(l[i][k]*l[j][k] for k in range(j))
   l[i][j]=math.sqrt(v) if i==j else v/l[j][j]
 w=[]
 for i in range(p):w.append((b[i]-math.fsum(l[i][k]*w[k] for k in range(i)))/l[i][i])
 beta=[0.0]*p
 for i in reversed(range(p)):beta[i]=(w[i]-math.fsum(l[k][i]*beta[k] for k in range(i+1,p)))/l[i][i]
 residual=max(abs(math.fsum(a[i][j]*beta[j] for j in range(p))-b[i]) for i in range(p))
 assert residual/max(1,max(map(abs,b)))<1e-10
 return beta,residual
def summarize(e,missing=0):
 return dict(evaluable=len(e),unavailable=missing,MAE=statistics.fmean(abs(x) for x in e),RMSE=math.sqrt(statistics.fmean(x*x for x in e)),bias=statistics.fmean(e))
def evaluate(beta,rs,missing):
 es=[ym+math.fsum(beta[j]*(r[2][j]-means[j])/scales[j] for j in range(p))-r[3] for r in rs]
 return dict(**summarize(es,missing),byHour=[dict(hour=h,**summarize([e for r,e in zip(rs,es) if r[1]==h])) for h in range(1,25)])
alphas=[0.01,0.1,1,10,100]
models={};validation=[]
for alpha in alphas:
 beta,residual=fit(alpha);models[alpha]=beta
 validation.append(dict(alpha=alpha,normalEquationMaxAbsoluteResidual=residual,**evaluate(beta,val,val_missing)))
selected=min(validation,key=lambda r:(r["MAE"],r["alpha"]))
alpha=selected["alpha"];beta=models[alpha]
# B7 frozen benchmark from versioned evidence; only validation accessed before decision.
bench=json.loads((root/"baselines/metrics.json").read_text())
b7val=bench["validation"]["B7"]
improvement=1-selected["MAE"]/b7val["MAE"]
decision=improvement>=0.05
print("SELECTION",json.dumps(dict(alpha=alpha,validationImprovement=improvement,candidate=decision)))
# First and only evaluation on test, after alpha and candidacy are frozen.
test,test_missing=build("2024-03-16","2024-03-30")
test_result=evaluate(beta,test,test_missing)
model=dict(modelType="Ridge",modelVersion="experimental-0.1.0",alpha=alpha,features=features,coefficients=beta,intercept=ym,scaling=dict(method="z-score; population standard deviation ddof=0; fitted only on usable TRAIN rows",means=means,standardDeviations=scales),trainedRange="2024-01-08..2024-02-29",snapshotSha256=sha)
metrics=dict(experiment="experimental Ridge; no HU-04 implementation",runtime=dict(python=platform.python_version(),implementation=platform.python_implementation(),dependencies="Python standard library only"),snapshotSha256=sha,partitions=dict(train="2024-01-01..2024-02-29",validation="2024-03-01..2024-03-15",test="2024-03-16..2024-03-30"),protocol=dict(origin="Daily before period 1",horizonPeriods=24,availability="Full previous day assumed available; XM publication latency not verified",objective="sum squared residuals + alpha * sum squared standardized coefficients; intercept not penalized",features=features,selection="minimum validation MAE, smaller alpha on tie",clearImprovementThreshold=0.05,formulas=dict(MAE="mean(abs(prediction-actual))",RMSE="sqrt(mean((prediction-actual)^2))",bias="mean(prediction-actual)")),training=dict(used=len(train),unavailable=train_missing,reason="First 7 days lack lag7 within frozen snapshot",effectiveRange=model["trainedRange"]),validation=validation,selectedAlpha=alpha,decisionBeforeTest=dict(validationMAEReductionFraction=improvement,principalCandidate=decision,referenceBaseline="B7"),test=test_result,comparison=dict(B7Validation=b7val,B7Test=bench["test"]["B7"]),model=model)
out=root/"ridge";out.mkdir(exist_ok=True)
for name,obj in [("metrics.json",metrics),("model.json",model)]:
 with (out/name).open("x",encoding="utf-8",newline="\n") as f:json.dump(obj,f,ensure_ascii=False,indent=2,allow_nan=False);f.write("\n")
print("RESULT",json.dumps(dict(validation=[{k:v for k,v in r.items() if k!="byHour"} for r in validation],selectedAlpha=alpha,test={k:v for k,v in test_result.items() if k!="byHour"},model=model)))

```
