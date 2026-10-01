import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..', '..');
const evidence = JSON.parse(readFileSync(resolve(root, 'docs/evidencias/hu-06-multihorizon-v3-semantic/results.json'), 'utf8'));
if (evidence.corpus.sha256 !== '18fd5aad3fe12eaa5290dba9ea551ccaef1a2baf4f41febf0c0354f0252c1735' || evidence.evaluationType !== 'retrospective_technical_reevaluation') throw new Error('Frozen HU-06 source mismatch.');
for (let horizonDays = 1; horizonDays <= 6; horizonDays++) {
  const result = evidence.v2.results[String(horizonDays)];
  if (!result || result.technicalCandidate !== true || result.horizonDays !== horizonDays || result.validation.selectedAlpha !== result.fittedParameters.alpha) throw new Error(`Frozen HU-06 h${horizonDays} mismatch.`);
  const artifact = {
    modelId: result.modelId, modelVersion: '1.0.0-experimental', modelFamily: 'ridge_direct_demand_v2_semantic',
    status: 'experimental', academicValidation: 'pending', horizonDays, orderedFeatures: result.orderedFeatures,
    scaler: { ddof: 0, means: result.fittedParameters.means, standardDeviations: result.fittedParameters.standardDeviations },
    coefficients: result.fittedParameters.coefficients, intercept: result.fittedParameters.intercept, alpha: result.fittedParameters.alpha,
    corpusHash: result.corpusHash, trainingRange: result.ranges.train, validationRange: result.ranges.validation,
    retrospectiveEvaluationRange: result.ranges.retrospectiveEvaluation, evaluationType: 'retrospective_technical',
    semanticEligibilityRule: evidence.semanticPolicy, baselineReference: result.validation.baselineReference,
    metrics: { validation: result.validation.ridge.find((row: { alpha: number }) => row.alpha === result.validation.selectedAlpha).metrics, retrospectiveEvaluation: result.retrospectiveEvaluation.ridge },
  };
  const path = resolve(root, `backend/src/models/xm-demandasin-ridge-direct-h${horizonDays}-v2/1.0.0/model.json`);
  mkdirSync(dirname(path), { recursive: true });
  const content = `${JSON.stringify(artifact, null, 2)}\n`;
  if (existsSync(path)) { if (readFileSync(path, 'utf8') !== content) throw new Error(`Frozen HU-06 h${horizonDays} artifact differs.`); }
  else writeFileSync(path, content, { encoding: 'utf8', flag: 'wx' });
}