"""Fixed protocol. Training/validation only; no runtime fitting or final-test metrics."""
import csv, hashlib, json, math
from datetime import date, timedelta, datetime, timezone
from pathlib import Path
import numpy as np

ROOT = Path(__file__).parent
def digest(b): return hashlib.sha256(b).hexdigest()
def write(path, value):
    with path.open('x', encoding='utf-8') as f: json.dump(value, f, ensure_ascii=False, indent=2, allow_nan=False)
def features(c, target):
    if len(c) != 672 or not np.all(np.isfinite(c)): raise ValueError('CONTEXT')
    result = []
    for p in range(24):
        x = [float(c[i+p]) for i in (648,624,504,336,0)] + [float(c[671]),float(c[647])]
        x += [float(np.mean(c[-24:])),float(np.mean(c[-168:])),float(np.std(c[-168:]))]
        x += [math.sin(2*math.pi*p/24),math.cos(2*math.pi*p/24),math.sin(2*math.pi*target.weekday()/7),math.cos(2*math.pi*target.weekday()/7),math.sin(2*math.pi*(target.month-1)/12),math.cos(2*math.pi*(target.month-1)/12),float(target.weekday()>=5)]
        result.append(x)
    return np.array(result)
def metrics(y,p):
    e=p-y
    return dict(n=len(y), MAE=float(np.mean(abs(e))), RMSE=float(np.sqrt(np.mean(e*e))), WAPE_percent=float(100*np.sum(abs(e))/np.sum(abs(y))), bias=float(np.mean(e)))

if __name__ == '__main__':
    protocol_bytes=(ROOT/'protocol.json').read_bytes(); protocol=json.loads(protocol_bytes)
    out=ROOT/'run-v1';out.mkdir(exist_ok=False)
    write(out/'registration.json',dict(protocol=protocol,protocolSha256=digest(protocol_bytes),sourceSha256=digest(Path(__file__).read_bytes()),registeredAt=datetime.now(timezone.utc).isoformat()))
    corpus=Path('D:/Proyectos/docs/evidencias/demanda-horaria-xm/corpus-2023-2025/corpus.csv').read_bytes()
    if digest(corpus)!=protocol['corpusSha256']: raise ValueError('CORPUS_HASH')
    rows=list(csv.DictReader(corpus.decode().splitlines()))
    # Do not load target values beyond validation end into the numerical array.
    rows=[r for r in rows if r['fecha_xm']<=protocol['validationEnd']]
    start=date(2023,1,1)
    for i,r in enumerate(rows):
        if r['fecha_xm']!=(start+timedelta(days=i//24)).isoformat() or int(r['periodo'])!=i%24+1: raise ValueError('CALENDAR')
    y=np.array([float(r['demanda_real_kwh']) for r in rows]);models={}
    if not np.all(np.isfinite(y)) or np.any(y<0): raise ValueError('VALUES')
    for h in protocol['horizons']:
        tx=[];ty=[];vx=[];vy=[];reference=[]
        for target_day in range(27+h,len(y)//24):
            origin=target_day-h; target=start+timedelta(days=target_day)
            context=y[(origin-27)*24:(origin+1)*24]
            x=features(context,target); values=y[target_day*24:(target_day+1)*24]
            if target.isoformat()<=protocol['trainEnd']: tx.extend(x);ty.extend(values)
            else: vx.extend(x);vy.extend(values);reference.extend(context[-24:])
        tx=np.array(tx);ty=np.array(ty);vx=np.array(vx);vy=np.array(vy)
        means=tx.mean(0);scales=tx.std(0);scales[scales==0]=1
        z=(tx-means)/scales; zv=(vx-means)/scales;intercept=float(ty.mean()); candidates=[]
        for alpha in protocol['alphas']:
            coefficients=np.linalg.solve(z.T@z+alpha*np.eye(17),z.T@(ty-intercept))
            candidates.append((metrics(vy,intercept+zv@coefficients),alpha,coefficients))
        score,alpha,coefficients=min(candidates,key=lambda a:(a[0]['MAE'],a[1]))
        artifact=dict(modelId=f'xm-demareal-ridge-direct-h{h}-v1',modelVersion=protocol['version'],horizonDays=h,contextPeriods=672,featureSchema='origin_28d_17_v1',algorithm='ridge',alpha=alpha,intercept=intercept,coefficients=coefficients.tolist(),means=means.tolist(),scales=scales.tolist(),corpusSha256=protocol['corpusSha256'],protocolSha256=digest(protocol_bytes),state=protocol['state'],trainingRange=dict(start=(start+timedelta(days=27+h)).isoformat(),end=protocol['trainEnd']),validationRange=dict(start=protocol['validationStart'],end=protocol['validationEnd']),validationMetrics=score,baselineMetrics=metrics(vy,np.array(reference)),trainingSamples=len(ty))
        write(out/f'h{h}.json',artifact)
        models[str(h)]=dict(file=f'h{h}.json',sha256=digest((out/f'h{h}.json').read_bytes()),validation=score,alpha=alpha)
        print(json.dumps(dict(h=h,alpha=alpha,validation=score)))
    write(out/'manifest.json',dict(status='frozen',createdAt=datetime.now(timezone.utc).isoformat(),protocolSha256=digest(protocol_bytes),sourceSha256=digest(Path(__file__).read_bytes()),corpusSha256=digest(corpus),models=models,evaluationType='validation_technical',testEvaluated=False,academicValidation='pending'))
