import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..', '..');
for (let horizonDays = 1; horizonDays <= 6; horizonDays++) {
  const source = readFileSync(resolve(root, `docs/evidencias/hu-06-demand-v5-frozen-models/h${horizonDays}.json`));
  const frozen = JSON.parse(source.toString('utf8'));
  if (frozen.horizonDays !== horizonDays || frozen.modelId !== `xm-demandasin-ridge-direct-h${horizonDays}-v5` || frozen.state !== 'pendingProspectiveValidation' || frozen.academicValidation !== 'pending') throw new Error('V5_FROZEN_MODEL_INCOMPATIBLE');
  const { trainingSourceProvenance, validationSourceProvenance, ...parameters } = frozen;
  const runtime = { ...parameters, modelStatus: 'experimental', sourceFrozenSha256: createHash('sha256').update(source).digest('hex') };
  const path = resolve(root, `backend/src/models/xm-demandasin-ridge-direct-h${horizonDays}-v5/1.0.0/model.json`);
  const content = `${JSON.stringify(runtime, null, 2)}\n`;
  if (existsSync(path)) {
    if (readFileSync(path, 'utf8') !== content) throw new Error(`V5_RUNTIME_ARTIFACT_DIFFERS_h${horizonDays}`);
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, { encoding: 'utf8', flag: 'wx' });
  }
}