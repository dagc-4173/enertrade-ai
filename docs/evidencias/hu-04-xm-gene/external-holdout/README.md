# HU-04 ? Holdout temporal externo XM Gene

## Alcance y reserva temporal

Marzo test (2024-03-16..2024-03-30) ya hab?a sido observado. El rango 2024-03-31..2024-04-29 se reserv? como nueva evaluaci?n temporal externa, sin seleccionar features, alpha ni protocolo con sus resultados. Algunos valores de 2024-04-01 hab?an aparecido en pruebas de integraci?n anteriores; no se afirma que cada observaci?n fuera in?dita. Esta es la primera evaluaci?n predictiva de este bloque en la sesi?n.

Generaci?n XM como proxy t?cnico de disponibilidad energ?tica; no equivale a ofertas transaccionales observadas. Sin timestamps inferidos. Validaci?n acad?mica/formal pendiente. HU-04 contin?a sin endpoint ni implementaci?n productiva.

## Adquisici?n y snapshot

APIs Express reales contra XM y PostgreSQL: importaci?n 201 (EnergyDataset 36), validaci?n 200 aprobada con xm_gene_base@1.0.0, cero errores/advertencias y canProceed=true; preparaci?n 200 (PreparedDataset 17) con xm_gene_preparacion_base@1.0.0 y reused=false.
Registros conservados en PostgreSQL. Snapshot le?do directamente del preparado en transacci?n READ ONLY, sin modificar la base.

720 filas, 30 d?as completos, periodos 1..24, cero huecos, duplicados y conflictos. Unidad kWh, valores finitos, sourceRecordIndex 0..719. CSV UTF-8 sin BOM, LF y salto final, sin redondeo. Se preservan las seis columnas y procedencia. El corpus original permanece intacto.

SHA-256 del [snapshot](xm-gene-2024-03-31_2024-04-29.csv): `9fdb41321a46f2b027b3578ebb0eca9894100653644bff6401ae901aeced9182`. Tama?o: 25109 bytes. El hash identifica esta copia, no autenticidad XM.

## Especificaci?n congelada antes de evaluar

B1: mismo periodo D-1. B7: mismo periodo D-7.
Ridge alpha=0.01; features en orden: D-1 mismo periodo, D-7 mismo periodo, periodo24 D-1, sin(2*pi*(hora_xm-1)/24), cos(2*pi*(hora_xm-1)/24).

Origen diario antes del periodo1, horizonte24. Toda referencia energ?tica es estrictamente anterior al d?a objetivo. No se usa el valor real del periodo previo del propio d?a objetivo. La historia de d?as anteriores del holdout se incorpora solo cuando ya pertenece al pasado del siguiente origen; no se reajusta el modelo diariamente. Se supone que el d?a previo est? publicado completo; no se verific? latencia XM.

Regla fijada antes del resultado:
1. Sin indisponibilidad atribuible al modelo.
2. MAE Ridge <= 1.05 * MAE B7.
3. Mejora estricta en MAE o RMSE frente a B7.
4. Sin evidencia de fallo num?rico o leakage.

No se realiz? b?squeda ni selecci?n nueva.

## Reentrenamiento

CPython 3.14.4, biblioteca est?ndar. Misma implementaci?n Cholesky del experimento anterior, misma p?rdida sum(residual^2)+alpha*sum(beta^2), intercepto no penalizado. Estandarizaci?n poblacional ddof=0 ajustada solo al hist?rico anterior al holdout.
1992 filas usadas de 2024-01-08..2024-03-30; 168 filas iniciales excluidas por ausencia de lag7. El hist?rico autorizado incluye el antiguo test observado, pero ning?n registro del nuevo holdout.
Coeficientes ajustados y congelados antes de cargar los valores objetivo del holdout.
Comprobaci?n de residual relativo de ecuaciones normales < 1e-10; par?metros finitos. No se realiz? validaci?n independiente del solver con otra librer?a.

[Modelo experimental](ridge-model.json) contiene coeficientes y escalado. Inferencia:
prediction = intercept + sum(beta[j]*(feature[j]-mean[j])/std[j]).
No es un modelo productivo.

## Resultados externos

MAE=mean(abs(prediction-actual)); RMSE=sqrt(mean((prediction-actual)^2)); bias=mean(prediction-actual).
C?lculo sin redondeo expl?cito; presentaci?n en kWh con dos decimales.

| M?todo | Evaluables | Indisponibles | MAE | RMSE | Bias |
| --- | ---: | ---: | ---: | ---: | ---: |
| B1 | 720 | 0 | 451560.26 | 668090.32 | -14580.98 |
| B7 | 720 | 0 | 381967.84 | 543845.11 | -46206.42 |
| Ridge | 720 | 0 | 329144.18 | 438880.24 | -17643.62 |

## Aplicaci?n literal de la regla

Los cuatro criterios resultaron true. Ridge supera a B7 y B1 tanto en MAE como en RMSE; cumple el l?mite MAE <= 105% de B7 y no tiene indisponibles. No se observ? evidencia de fallo num?rico ni referencias del d?a objetivo/futuro en las features.

**Ridge cumple la regla para ser candidato a implementaci?n HU-04**, sin implementaci?n autom?tica ni promoci?n productiva.
Bias externo -17643.62 kWh, frente a +515393.59 kWh en el test anterior del experimento Ridge. Su magnitud disminuy?, pero cambian tanto periodo como instancia entrenada; esto no demuestra estabilidad general del bias. Respecto a B7 el bias absoluto es menor, respecto a B1 es mayor.

## M?tricas por periodo

30 evaluables y cero indisponibles por m?todo y periodo; MAE / RMSE en kWh.

| Periodo | B1 | B7 | Ridge |
| --- | ---: | ---: | ---: |
| 1 | 208165.11 / 262335.70 | 314191.21 / 380173.48 | 193756.85 / 226157.27 |
| 2 | 200414.64 / 246418.15 | 273998.78 / 339529.90 | 172674.33 / 200935.92 |
| 3 | 196077.55 / 252639.88 | 276808.64 / 346416.14 | 184195.60 / 219432.24 |
| 4 | 185538.16 / 236956.73 | 252816.19 / 308799.56 | 178192.34 / 208637.49 |
| 5 | 245427.89 / 290925.57 | 273104.52 / 330116.45 | 196428.04 / 221916.70 |
| 6 | 369529.85 / 492285.93 | 327982.08 / 421052.64 | 267836.70 / 320491.31 |
| 7 | 492999.33 / 681735.68 | 343294.97 / 509752.05 | 313563.39 / 406083.13 |
| 8 | 558570.13 / 813204.77 | 365362.75 / 556405.12 | 350781.79 / 462147.52 |
| 9 | 598508.70 / 888181.95 | 359643.73 / 601778.70 | 363450.34 / 513759.27 |
| 10 | 609774.73 / 894713.41 | 379095.40 / 616851.15 | 373575.21 / 521864.40 |
| 11 | 607777.41 / 884782.91 | 408255.46 / 641246.63 | 380508.07 / 536276.61 |
| 12 | 620439.47 / 901654.75 | 443810.31 / 661136.78 | 399346.83 / 543838.75 |
| 13 | 547930.30 / 781560.66 | 418143.36 / 606621.15 | 367389.34 / 482956.37 |
| 14 | 595275.38 / 811293.47 | 458012.02 / 650695.43 | 410059.44 / 523670.96 |
| 15 | 688720.29 / 934806.68 | 505110.41 / 709586.63 | 465813.12 / 585761.76 |
| 16 | 707305.14 / 952926.09 | 523576.31 / 743924.17 | 489713.03 / 609394.21 |
| 17 | 672436.32 / 902812.72 | 509773.47 / 726757.29 | 488230.42 / 591473.83 |
| 18 | 576873.06 / 776259.16 | 440760.29 / 616719.76 | 429661.62 / 520288.52 |
| 19 | 458961.54 / 616679.85 | 398612.56 / 535103.99 | 328077.76 / 424311.29 |
| 20 | 420938.71 / 546991.05 | 412541.74 / 534009.17 | 344325.71 / 442971.75 |
| 21 | 400388.64 / 513315.19 | 407137.71 / 518593.67 | 345579.32 / 441529.33 |
| 22 | 353573.64 / 445555.10 | 385900.87 / 488711.63 | 321580.61 / 410938.28 |
| 23 | 273423.22 / 342553.58 | 354870.72 / 424774.05 | 272791.05 / 331729.27 |
| 24 | 248396.99 / 311515.76 | 334424.57 / 400056.41 | 261929.38 / 311229.78 |

## L?mites y reproducci?n

Una evaluaci?n de 30 d?as no acredita generalizaci?n anual. El holdout ya qued? observado y no debe reutilizarse como evidencia nueva independiente para selecci?n posterior. No hubo consultas externas durante el entrenamiento/evaluaci?n. La normalizaci?n original a Number/float conserva su precisi?n num?rica disponible, no aritm?tica decimal arbitraria.

metrics.json conserva todos los resultados, criterios y hashes. Para reproducir, ejecutar por stdin desde la ra?z en una copia sin metrics.json ni ridge-model.json en esta carpeta. El script reutiliza literalmente las funciones del c?digo documentado en ridge/README.md, cambia solo la ventana de entrenamiento autorizada y mantiene alpha, features, solver y escalado. Las comparaciones est?n congeladas antes de cargar los objetivos externos.

```python

import json,hashlib
from pathlib import Path
root=Path("docs/evidencias/hu-04-xm-gene")
text=(root/"ridge/README.md").read_text(encoding="utf-8")
original=text.split("```python\n")[1].split("\n```")[0]
# Reuse the identical frozen feature construction, standardization and solver.
prefix=original.split("alphas=[")[0]
prefix=prefix.replace('train,train_missing=build("2024-01-01","2024-02-29")','train,train_missing=build("2024-01-01","2024-03-30")')
prefix=prefix.replace('val,val_missing=build("2024-03-01","2024-03-15")','')
prefix=prefix.replace('assert len(train)==1272 and train_missing==168','assert len(train)==1992 and train_missing==168')
exec(prefix)
out=root/"external-holdout"
manifest=json.loads((out/"manifest.json").read_text())
alpha=0.01
beta,residual=fit(alpha)
assert all(math.isfinite(x) for x in beta+[ym]+means+scales)
model=dict(modelType="Ridge",modelVersion="experimental-external-holdout-0.1.0",alpha=alpha,features=features,coefficients=beta,intercept=ym,scaling=dict(method="z-score population ddof=0; fitted only on usable pre-holdout rows",means=means,standardDeviations=scales),trainedRange="2024-01-08..2024-03-30",trainingRows=len(train),snapshotSha256=sha)
# Model fixed before loading holdout target values.
holdout_bytes=(out/manifest["snapshot"]["file"]).read_bytes()
assert hashlib.sha256(holdout_bytes).hexdigest()==manifest["snapshot"]["sha256"]
hr=list(csv.DictReader(holdout_bytes.decode().splitlines()))
assert len(hr)==720
for r in hr:
 k=(r["fecha_xm"],int(r["hora_xm"]))
 assert k not in data
 data[k]=float(r["energia_kwh"])
held,missing=build("2024-03-31","2024-04-29")
assert len(held)==720 and missing==0
ridge=evaluate(beta,held,missing)
results={"Ridge":ridge}
for label,lag in [("B1",1),("B7",7)]:
 errors=[];hours={h:[] for h in range(1,25)}
 for d,h,x,y in held:
  ref=(date.fromisoformat(d)-timedelta(days=lag)).isoformat()
  assert ref<d
  err=data[ref,h]-y;errors.append(err);hours[h].append(err)
 results[label]=dict(**summarize(errors),byHour=[dict(hour=h,**summarize(hours[h])) for h in hours])
b7=results["B7"]
criteria=dict(noModelUnavailability=ridge["unavailable"]==0,MAENotWorseThanB7ByMoreThan5Percent=ridge["MAE"]<=1.05*b7["MAE"],improvesMAEOrRMSEAgainstB7=ridge["MAE"]<b7["MAE"] or ridge["RMSE"]<b7["RMSE"],noNumericalFailureOrLeakageEvidence=True)
metrics=dict(runtime=dict(python=platform.python_version(),dependencies="stdlib only"),specification=dict(alpha=0.01,features=features,origin="daily before period1",horizon=24,trainingRange="2024-01-01..2024-03-30",effectiveTrainingRows=1992,excludedRows=168,exclusion="First seven days lack lag7",scaling="train-only population standard deviation",solver="same Cholesky sum-squared-error Ridge; intercept unpenalized",rule="no model unavailable AND MAE_Ridge <= 1.05*MAE_B7 AND (MAE_Ridge < MAE_B7 OR RMSE_Ridge < RMSE_B7) AND no numerical/leakage evidence",normalEquationMaxAbsoluteResidual=residual),originalSnapshotSha256=sha,holdoutSnapshotSha256=manifest["snapshot"]["sha256"],results=results,criteria=criteria,candidateForHU04=all(criteria.values()),comparison=dict(ridgeBeatsB7MAE=ridge["MAE"]<b7["MAE"],ridgeBeatsB1MAE=ridge["MAE"]<results["B1"]["MAE"],ridgeMAERelativeToB7=ridge["MAE"]/b7["MAE"]-1))
for name,obj in [("ridge-model.json",model),("metrics.json",metrics)]:
 with (out/name).open("x",encoding="utf-8") as f:json.dump(obj,f,indent=2,allow_nan=False);f.write("\n")
print(json.dumps(dict(trainingRows=len(train),model=model,results={k:{a:b for a,b in v.items() if a!="byHour"} for k,v in results.items()},criteria=criteria,candidate=metrics["candidateForHU04"])))

```
