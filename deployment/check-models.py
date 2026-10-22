"""Preflight offline: valida pesos exactos sin cargar Torch ni descargar modelos."""
import hashlib
import importlib.metadata
import os
from pathlib import Path
import runpy
import sys

def sha256(path):
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4*1024*1024), b''):
            digest.update(block)
    return digest.hexdigest()

def main():
    locks=runpy.run_path(str(Path(__file__).parent.parent/'backend/src/python/chronos_worker.py'))['LOCKS']
    if importlib.metadata.version('chronos-forecasting')!='2.3.2':
        raise ValueError('CHRONOS_PACKAGE_VERSION_MISMATCH')
    for model,key in [('chronos2','CHRONOS2_MODEL_PATH'),('bolt','CHRONOS_BOLT_MODEL_PATH')]:
        root=Path(os.environ.get(key,''))
        if not root.is_absolute():
            raise ValueError('CHRONOS_MODEL_PATH_REQUIRED')
        for name,label in [('config.json','config'),('model.safetensors','weights')]:
            if sha256(root/name)!=locks[model][label]:
                raise ValueError('CHRONOS_CHECKPOINT_MISMATCH')
        print(model+': checkpoint verificado')

if __name__=='__main__':
    try:
        main()
    except Exception:
        print('No se pudo verificar Chronos. Revisa paquete, rutas y pesos de las revisiones documentadas.',file=sys.stderr)
        sys.exit(1)
