"""Copia checkpoints fijados como archivos reales, sin conservar enlaces del cache."""
import argparse
import hashlib
from pathlib import Path
import runpy
import shutil
import sys

def digest(path):
    value=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(4*1024*1024),b''):
            value.update(block)
    return value.hexdigest()

def copy_checked(source,target,expected):
    if digest(source)!=expected:
        raise ValueError('SOURCE_CHECKPOINT_MISMATCH')
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists():
        if digest(target)!=expected:
            raise ValueError('DESTINATION_EXISTS_WITH_DIFFERENT_CONTENT')
        return
    # Exclusive creation prevents silently overwriting a checkpoint already present.
    with source.open('rb') as reader,target.open('xb') as writer:
        shutil.copyfileobj(reader,writer,4*1024*1024)
    if digest(target)!=expected:
        raise ValueError('COPIED_CHECKPOINT_MISMATCH')

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--chronos2',type=Path,required=True)
    parser.add_argument('--bolt',type=Path,required=True)
    parser.add_argument('--output',type=Path,default=Path('deployment/models'))
    args=parser.parse_args()
    locks=runpy.run_path(str(Path(__file__).parent.parent/'backend/src/python/chronos_worker.py'))['LOCKS']
    for model,source in [('chronos2',args.chronos2),('bolt',args.bolt)]:
        for name,key in [('config.json','config'),('model.safetensors','weights')]:
            copy_checked(source/name,args.output/model/name,locks[model][key])
        print(model+': archivos copiados y verificados')

if __name__=='__main__':
    try:
        main()
    except Exception:
        print('No se prepararon todos los pesos. Revisa fuentes y destino; los archivos existentes no se sobrescriben.',file=sys.stderr)
        sys.exit(1)
