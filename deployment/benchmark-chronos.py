"""Medición en el contenedor Linux con contexto real de 672 observaciones."""
import argparse
import json
import math
import os
from pathlib import Path
import resource
import subprocess
import sys
import time

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--model',choices=['chronos2','bolt'],required=True)
    parser.add_argument('--context',type=Path,required=True)
    parser.add_argument('--periods',type=int,choices=[24,48,72,96,120,144,168],default=24)
    args=parser.parse_args()
    data=json.loads(args.context.read_text(encoding='utf-8'))
    context=data.get('context') if isinstance(data,dict) else data
    if not isinstance(context,list) or len(context)!=672 or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in context):
        raise ValueError('Se requieren 672 observaciones numéricas finitas')
    key='CHRONOS2_MODEL_PATH' if args.model=='chronos2' else 'CHRONOS_BOLT_MODEL_PATH'
    request={'model':args.model,'checkpoint':os.environ[key],'context':context,'predictionPeriods':args.periods}
    worker=Path(__file__).parent.parent/'backend/src/python/chronos_worker.py'
    started=time.perf_counter()
    result=subprocess.run([sys.executable,'-I','-B',str(worker)],input=json.dumps(request),capture_output=True,text=True,timeout=120)
    elapsed=time.perf_counter()-started
    if result.returncode!=0 or 'quantiles' not in json.loads(result.stdout):
        raise RuntimeError('La inferencia no completó; no se publica stdout del modelo')
    print(json.dumps({'model':args.model,'periods':args.periods,'seconds':round(elapsed,3),'childPeakRssMiB':round(resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss/1024,2),'scope':'worker Python; medir también docker stats para consumo total','accuracyEvaluated':False}))

if __name__=='__main__':
    try:
        main()
    except Exception:
        print('Benchmark no completado. Revisa contexto, entorno y pesos; límite 120 s.',file=sys.stderr)
        sys.exit(1)
