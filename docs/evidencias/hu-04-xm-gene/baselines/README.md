# HU-04 ? Evaluaci?n de baselines XM Gene

## Prop?sito y fuente

Evaluaci?n descriptiva reproducible sobre el [snapshot congelado](../xm-gene-2024-01-01_2024-03-30.csv), exclusivamente local. Generaci?n XM se utiliza como proxy t?cnico de disponibilidad energ?tica; no equivale a ofertas transaccionales observadas. No se consult? XM ni PostgreSQL.

SHA-256 verificado antes de calcular: `4c91a20048d90d082f8eec6c770f4bd042e479d70df7ca020e8dd3a6b3ba0177`. Se verificaron 2160 filas, 90 fechas consecutivas, 24 periodos por fecha, claves ?nicas y rango 2024-01-01..2024-03-30.

## Protocolo fijado

La solicitud no fijaba expl?citamente origen y longitud del horizonte. Se adopt? un origen antes del periodo 1 de cada d?a y horizonte de los 24 periodos de ese d?a; 15 or?genes por partici?n. Es evaluaci?n diaria con actualizaci?n del pasado disponible, no un ?nico pron?stico de 15 d?as ni evaluaci?n un paso adelante.

- TRAIN: 2024-01-01..2024-02-29.
- VALIDATION: 2024-03-01..2024-03-15.
- TEST: 2024-03-16..2024-03-30.

Las particiones no se modificaron. Estos baselines no ajustan par?metros sobre train.

## Definiciones y prevenci?n de leakage

- B0: para cada origen diario, el valor de (d?a anterior, periodo 24) se mantiene para los 24 periodos futuros. La cobertura comprobada permite identificarlo como ?ltimo valor disponible.
- B1: para (d?a, periodo), usar (d?a anterior, mismo periodo).
- B7: para (d?a, periodo), usar (siete d?as antes, mismo periodo).

Todas las b?squedas usan claves fecha/periodo. Ninguna referencia pertenece al d?a objetivo o al futuro. Los d?as anteriores de validation/test pasan a ser historia disponible en los or?genes posteriores; no se utilizan resultados del propio d?a objetivo. No se desplazan filas ni se infieren timestamps. La aritm?tica de fechas se usa solo para buscar fechas calendario. Se supone disponibilidad completa del d?a anterior; no se verific? latencia real de publicaci?n XM.

La selecci?n se calcul? exclusivamente en validation: menor MAE, RMSE como desempate y despu?s ID. B7 qued? fijado antes de calcular test. Las m?tricas test de los tres baselines se presentan por requerimiento de comparaci?n, no para reseleccionar.

## F?rmulas

Para n pares evaluables, e? = prediction? ? actual?:

- MAE = ?|e?| / n.
- RMSE = ?(?e?? / n).
- bias = ?e? / n.

Un sesgo positivo indica sobreestimaci?n. Si falta referencia u observaci?n, se cuenta como indisponible y no entra en n; con n=0 las m?tricas son null. C?lculo IEEE-754 sin redondeo expl?cito; ?nicamente estas tablas se presentan con dos decimales. M?tricas en kWh.

## Resultados validation

| Baseline | Evaluables | Indisponibles | MAE | RMSE | Bias |
| --- | ---: | ---: | ---: | ---: | ---: |
| B0 | 360 | 0 | 1057127.91 | 1217742.13 | -493934.88 |
| B1 | 360 | 0 | 425738.65 | 698598.59 | -22918.75 |
| B7 | 360 | 0 | 236660.34 | 278936.66 | -227919.06 |

## Resultados test

| Baseline | Evaluables | Indisponibles | MAE | RMSE | Bias |
| --- | ---: | ---: | ---: | ---: | ---: |
| B0 | 360 | 0 | 891139.14 | 1046484.40 | -214707.36 |
| B1 | 360 | 0 | 508680.99 | 701147.73 | 97848.76 |
| B7 | 360 | 0 | 515943.76 | 806030.32 | 449211.62 |

**Seleccionado por validation: B7.** Su ?nica evaluaci?n final en test tiene MAE 515943.76, RMSE 806030.32 y bias 449211.62 kWh. B1 obtiene menor error en test, pero no sustituye al baseline seleccionado.

## M?tricas por periodo

Cada celda muestra MAE / RMSE en kWh. Cada baseline tiene 15 pares evaluables y 0 indisponibles por periodo en cada partici?n.

### validation

| hora_xm | B0 MAE / RMSE | B1 MAE / RMSE | B7 MAE / RMSE |
| --- | ---: | ---: | ---: |
| 1 | 509309.24 / 523003.69 | 191175.38 / 256706.58 | 229803.30 / 280634.35 |
| 2 | 824299.02 / 834361.28 | 175216.74 / 245851.31 | 226272.63 / 263619.47 |
| 3 | 1057301.46 / 1064378.47 | 180222.77 / 247244.98 | 214495.86 / 248308.85 |
| 4 | 1178895.14 / 1186812.92 | 189347.09 / 252265.23 | 212114.08 / 242963.55 |
| 5 | 1088638.16 / 1103348.61 | 239780.81 / 322055.55 | 199650.49 / 231630.53 |
| 6 | 700110.05 / 789740.78 | 396523.09 / 540266.09 | 195245.94 / 232379.98 |
| 7 | 631181.95 / 791597.94 | 503717.75 / 717844.18 | 198928.88 / 254169.71 |
| 8 | 395131.58 / 588033.28 | 554643.71 / 824608.55 | 206104.84 / 257953.10 |
| 9 | 581958.22 / 671979.78 | 623530.35 / 965584.11 | 220493.59 / 252945.79 |
| 10 | 802207.69 / 846007.07 | 587015.68 / 992864.65 | 232621.31 / 264002.95 |
| 11 | 1052643.59 / 1125611.65 | 566957.61 / 917950.99 | 243272.51 / 283244.52 |
| 12 | 1270577.33 / 1381847.25 | 582178.48 / 945062.12 | 231362.98 / 274454.78 |
| 13 | 1197849.73 / 1305382.38 | 569255.67 / 850828.64 | 220905.43 / 274838.22 |
| 14 | 1323367.07 / 1453646.16 | 571612.77 / 871071.94 | 227416.48 / 277495.63 |
| 15 | 1503751.87 / 1656696.60 | 629877.97 / 990126.33 | 243727.57 / 292335.42 |
| 16 | 1508524.01 / 1666784.59 | 641359.10 / 992252.02 | 234924.07 / 284632.78 |
| 17 | 1375877.88 / 1531931.37 | 616197.21 / 932340.15 | 243725.65 / 288419.27 |
| 18 | 1095084.66 / 1221849.35 | 509763.06 / 770047.14 | 240317.33 / 275714.40 |
| 19 | 1585394.88 / 1649342.92 | 412115.54 / 609902.47 | 310922.21 / 345609.13 |
| 20 | 1856481.08 / 1909068.21 | 380649.26 / 539460.23 | 310452.95 / 342614.81 |
| 21 | 1680453.64 / 1741874.44 | 347236.84 / 504637.47 | 298899.71 / 336609.92 |
| 22 | 1233897.84 / 1300507.75 | 273549.05 / 403916.19 | 259435.01 / 293090.38 |
| 23 | 676766.66 / 741365.84 | 234434.67 / 353427.14 | 245828.47 / 282897.86 |
| 24 | 241367.08 / 318618.57 | 241367.08 / 318618.57 | 232926.81 / 275824.95 |

### test

| hora_xm | B0 MAE / RMSE | B1 MAE / RMSE | B7 MAE / RMSE |
| --- | ---: | ---: | ---: |
| 1 | 513876.70 / 524639.04 | 228775.88 / 276299.56 | 306072.08 / 425204.86 |
| 2 | 817416.88 / 824931.48 | 217718.14 / 273223.09 | 286715.48 / 409044.57 |
| 3 | 1054196.64 / 1058957.75 | 196431.16 / 254627.41 | 298908.35 / 442948.28 |
| 4 | 1168888.18 / 1177219.53 | 189934.13 / 241548.25 | 271697.32 / 384108.66 |
| 5 | 1137025.44 / 1148841.86 | 241409.18 / 296684.66 | 317133.70 / 449790.33 |
| 6 | 963538.84 / 1023049.10 | 370286.02 / 456812.32 | 469172.01 / 653561.74 |
| 7 | 956333.28 / 1066553.19 | 497916.90 / 629723.49 | 525720.59 / 769103.79 |
| 8 | 600192.62 / 774436.62 | 565029.66 / 747409.54 | 569933.61 / 830997.15 |
| 9 | 511436.10 / 628513.80 | 665760.73 / 895805.28 | 603046.08 / 892239.94 |
| 10 | 604957.53 / 669003.03 | 657861.56 / 889464.36 | 608335.48 / 918048.33 |
| 11 | 763591.62 / 858837.91 | 695251.34 / 918216.62 | 646113.54 / 958718.94 |
| 12 | 908355.49 / 1073539.95 | 748744.06 / 945801.96 | 640291.95 / 973436.95 |
| 13 | 891339.32 / 1071647.19 | 680115.48 / 849007.07 | 575313.70 / 897919.57 |
| 14 | 954821.69 / 1164081.20 | 723418.39 / 900480.52 | 618444.26 / 953251.80 |
| 15 | 1032762.70 / 1272968.83 | 787176.76 / 1002928.10 | 675042.74 / 1056819.21 |
| 16 | 1037044.12 / 1284306.72 | 810276.56 / 1048275.14 | 702604.66 / 1109727.45 |
| 17 | 933680.44 / 1155290.34 | 762661.40 / 986404.32 | 686013.58 / 1097947.83 |
| 18 | 751916.30 / 922186.68 | 653647.87 / 809963.40 | 602820.77 / 930027.63 |
| 19 | 1259206.13 / 1370196.77 | 546532.77 / 688150.61 | 569082.50 / 868470.67 |
| 20 | 1504995.56 / 1597325.91 | 544427.92 / 643079.88 | 590389.01 / 886627.22 |
| 21 | 1341899.72 / 1438609.69 | 484391.46 / 579337.10 | 582810.68 / 860095.77 |
| 22 | 956424.44 / 1049824.32 | 385146.71 / 466123.77 | 485240.59 / 715430.39 |
| 23 | 477445.46 / 578996.14 | 309435.48 / 382779.10 | 404943.30 / 569453.91 |
| 24 | 245994.14 / 298814.01 | 245994.14 / 298814.01 | 346804.26 / 483153.03 |

## Evidencia y limitaciones

[metrics.json](metrics.json) conserva m?tricas globales y por periodo con precisi?n num?rica completa, conteos, protocolo, f?rmulas y selecci?n. El test se calcul? una vez para el protocolo fijado. No se entren? ni persisti? un modelo, no se implement? endpoint HU-04 y ning?n baseline se presenta como modelo IA. Los resultados no acreditan generalizaci?n fuera del periodo. Validaci?n acad?mica/formal pendiente. El hash identifica el snapshot, no autenticidad de XM.

## Reproducci?n

Desde la ra?z del repositorio, ejecutar el JavaScript siguiente mediante Bun por stdin. Usa ?nicamente m?dulos est?ndar; no requiere librer?as ML. El archivo metrics.json debe no existir en la copia de reproducci?n: la escritura exclusiva evita sobrescribir evidencia. El script verifica el hash antes de calcular, congela la selecci?n antes de test y genera metrics.json.

```javascript

import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root='docs/evidencias/hu-04-xm-gene';
const path=root+'/xm-gene-2024-01-01_2024-03-30.csv';
const hash='4c91a20048d90d082f8eec6c770f4bd042e479d70df7ca020e8dd3a6b3ba0177';
const bytes=readFileSync(path);
assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);
const lines=bytes.toString('utf8').trimEnd().split('\n');
assert.equal(lines.shift(),'fecha_xm,hora_xm,energia_kwh,prepared_dataset_id,source_dataset_id,source_record_index');
const rows=lines.map(l=>{const v=l.split(',');assert.equal(v.length,6);assert(v.every(x=>x!==''));return {date:v[0],hour:Number(v[1]),value:Number(v[2])};});
assert.equal(rows.length,2160);
const key=(d,h)=>d+'|'+h;
const map=new Map();
for(const r of rows){assert(/^\d{4}-\d{2}-\d{2}$/.test(r.date));assert(Number.isInteger(r.hour)&&r.hour>=1&&r.hour<=24);assert(Number.isFinite(r.value));assert(!map.has(key(r.date,r.hour)));map.set(key(r.date,r.hour),r.value);}
const day=(d,n)=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);}; // Calendar arithmetic only.
const dates=[...new Set(rows.map(r=>r.date))].sort();
assert.equal(dates.length,90);assert.equal(dates[0],'2024-01-01');assert.equal(dates.at(-1),'2024-03-30');
for(let d='2024-01-01';d<='2024-03-30';d=day(d,1))for(let h=1;h<=24;h++)assert(map.has(key(d,h)));
const partitions={train:['2024-01-01','2024-02-29'],validation:['2024-03-01','2024-03-15'],test:['2024-03-16','2024-03-30']};
const formulas={MAE:'sum(abs(prediction-actual))/n',RMSE:'sqrt(sum((prediction-actual)^2)/n)',bias:'sum(prediction-actual)/n'};
function summarize(errors){const e=errors.filter(x=>x!==null),n=e.length;return {evaluable:n,unavailable:errors.length-n,MAE:n?e.reduce((s,x)=>s+Math.abs(x),0)/n:null,RMSE:n?Math.sqrt(e.reduce((s,x)=>s+x*x,0)/n):null,bias:n?e.reduce((s,x)=>s+x,0)/n:null};}
function evaluate(id,range){const errors=[],hours=Array.from({length:24},()=>[]);
for(let d=range[0];d<=range[1];d=day(d,1)){for(let h=1;h<=24;h++){
const referenceDate=day(d,id==='B7'?-7:-1),referenceHour=id==='B0'?24:h;
assert(referenceDate<d);const prediction=map.get(key(referenceDate,referenceHour)),actual=map.get(key(d,h));
const error=prediction===undefined||actual===undefined?null:prediction-actual;errors.push(error);hours[h-1].push(error);
}}
return {...summarize(errors),byHour:hours.map((e,i)=>({hour:i+1,...summarize(e)}))};}
const ids=['B0','B1','B7'];
const validation=Object.fromEntries(ids.map(id=>[id,evaluate(id,partitions.validation)]));
const selected=[...ids].sort((a,b)=>validation[a].MAE-validation[b].MAE||validation[a].RMSE-validation[b].RMSE||a.localeCompare(b))[0];
console.log('VALIDATION_SELECTION',JSON.stringify({validation,selected}));
// Selection is frozen before any test metrics are calculated.
const test=Object.fromEntries(ids.map(id=>[id,evaluate(id,partitions.test)]));
const result={schemaVersion:1,snapshot:{path,sha256:hash,observations:2160,dates:90,periodsPerDate:24,missing:0,duplicateKeys:0},protocol:{origin:'Before period 1 of each date; all previous dates available',horizonPeriods:24,originsPerPartition:15,availabilityAssumption:'Previous day observations are available in full at each daily origin; publication latency not verified',lookup:'Exact calendar date and numeric period keys; no positional shift',arithmetic:'ECMAScript Number (IEEE-754); no explicit rounding',units:'kWh',baselines:{B0:'Previous date period 24 repeated for all 24 target periods (last available value under verified full coverage)',B1:'Previous calendar date, same period',B7:'Seven calendar dates earlier, same period'},selection:'Minimum validation MAE; RMSE tie-break, then baseline ID; never test',formulas},partitions,validation,selection:{partition:'validation',baseline:selected},test,finalTest:{baseline:selected,...test[selected]}};
mkdirSync(root+'/baselines',{recursive:true});writeFileSync(root+'/baselines/metrics.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('SUMMARY',JSON.stringify({validation:Object.fromEntries(ids.map(id=>{const {byHour,...m}=validation[id];return [id,m]})),selected,test:Object.fromEntries(ids.map(id=>{const {byHour,...m}=test[id];return [id,m]}))}));

```
