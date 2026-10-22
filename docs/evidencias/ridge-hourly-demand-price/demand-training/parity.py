import csv, json, math
from pathlib import Path
from datetime import date, timedelta
import numpy as np
from train import features, ROOT

rows=list(csv.DictReader(Path('D:/Proyectos/docs/evidencias/demanda-horaria-xm/corpus-2023-2025/corpus.csv').read_text().splitlines()))
context=[float(r['demanda_real_kwh']) for r in rows if '2025-01-01'<=r['fecha_xm']<='2025-01-28']
assert len(context)==672
expected=[]
for h in range(1,8):
    m=json.loads((ROOT/f'run-v1/h{h}.json').read_text());target=(date(2025,1,28)+timedelta(days=h)).isoformat()
    x=features(np.array(context),date.fromisoformat(target))
    predicted=m['intercept']+((x-np.array(m['means']))/np.array(m['scales']))@np.array(m['coefficients'])
    expected.append(dict(horizonDays=h,targetDate=target,features=x.tolist(),predictions=predicted.tolist()))
p=ROOT/'run-v1/parity.json'
with p.open('x') as f: json.dump(dict(context=context,origin='2025-01-28',expected=expected),f)
