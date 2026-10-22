"""Bounded stdin/stdout worker. Checkpoint paths come from server configuration only."""
import hashlib
import json
import math
import os
from pathlib import Path
import sys

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
LOCKS = {
    'chronos2': {'revision': '29ec3766d36d6f73f0696f85560a422f50e8498c', 'config': 'ef1143bfdc9c0376d9a056eefca46cb4b1ec3d0ffacd541ff56feb40fb708031', 'weights': 'ddcda3c7508bf2528087723e98a20707cc04b7f370ae275a9fd88078ddba4f42'},
    'bolt': {'revision': '772f3d25d38aec6d914c8949dab4462e2d46f5d8', 'config': '9ca0ebbe049ccebacb0546361e8aa728f0cf104cd18d1838d78d296aa317bd21', 'weights': '06a6a19bbe74bc10a9cd193bd4bf2bf638ae07f7e0d51653ae7ab8ea968a21dd'},
}


def main():
    import importlib.metadata
    request = json.loads(sys.stdin.buffer.read(32769))
    if set(request) != {'model', 'checkpoint', 'context', 'predictionPeriods'} or request['model'] not in LOCKS:
        raise ValueError('INVALID_REQUEST')
    context = request['context']
    periods = request['predictionPeriods']
    if not isinstance(context, list) or len(context) != 672 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in context):
        raise ValueError('INVALID_CONTEXT')
    if isinstance(periods, bool) or not isinstance(periods, int) or periods % 24 or not 24 <= periods <= 168:
        raise ValueError('INVALID_HORIZON')
    # Keep the API on the package version that was experimentally evaluated.
    if importlib.metadata.version('chronos-forecasting') != '2.3.2':
        raise ValueError('PACKAGE_VERSION_MISMATCH')
    checkpoint = Path(request['checkpoint'])
    if not checkpoint.is_absolute():
        raise ValueError('INVALID_CHECKPOINT')
    lock = LOCKS[request['model']]
    for name, expected in [('config.json', lock['config']), ('model.safetensors', lock['weights'])]:
        if hashlib.sha256((checkpoint / name).read_bytes()).hexdigest() != expected:
            raise ValueError('CHECKPOINT_MISMATCH')
    import torch
    from chronos import Chronos2Pipeline, ChronosBoltPipeline
    torch.set_num_threads(4)
    torch.manual_seed(4173)
    cls = Chronos2Pipeline if request['model'] == 'chronos2' else ChronosBoltPipeline
    pipe = cls.from_pretrained(str(checkpoint), device_map='cpu', local_files_only=True)
    kwargs = {'batch_size': 1, 'cross_learning': False, 'context_length': 672} if request['model'] == 'chronos2' else {}
    with torch.inference_mode():
        q, _ = pipe.predict_quantiles([torch.tensor(context, dtype=torch.float32)], prediction_length=periods, quantile_levels=[.1, .5, .9], **kwargs)
    values = q[0].reshape(periods, 3).tolist()
    if any(not all(math.isfinite(v) for v in row) or not row[0] <= row[1] <= row[2] for row in values):
        raise ValueError('INVALID_QUANTILES')
    print(json.dumps({'model': request['model'], 'revision': lock['revision'], 'quantiles': values}, allow_nan=False))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'error': 'CHRONOS_WORKER_FAILED'}))
        sys.exit(1)

