import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseCsv, sha256, verifyCorpus } from '@/experiments/hu06-multihorizon';
import { experimentV2, omittedCandidatesV2, orderedFeaturesV2 } from '@/experiments/hu06-multihorizon-v2';

const root = resolve(import.meta.dir, '..', '..');
const v1Directory = resolve(root, 'docs/evidencias/hu-06-multihorizon');
const v2Directory = resolve(root, 'docs/evidencias/hu-06-multihorizon-v2');
const manifestV1 = JSON.parse(readFileSync(resolve(v1Directory, 'corpus/manifest.json'), 'utf8')) as any;
const resultsV1 = JSON.parse(readFileSync(resolve(v1Directory, 'results.json'), 'utf8')) as any;
const corpusPath = resolve(root, manifestV1.corpus.file);
const corpusText = readFileSync(corpusPath, 'utf8');
const corpusHash = sha256(corpusText);
if (corpusHash !== '18fd5aad3fe12eaa5290dba9ea551ccaef1a2baf4f41febf0c0354f0252c1735' || corpusHash !== manifestV1.corpus.sha256) throw new Error('Frozen HU-06 V1 corpus hash mismatch; V2 stopped.');
const records = parseCsv(corpusText); const corpus = verifyCorpus(records);
if (corpus.firstDate !== '2024-01-01' || corpus.lastDate !== '2026-09-29' || corpus.observations !== 1003) throw new Error('Frozen HU-06 corpus integrity mismatch; V2 stopped.');
mkdirSync(v2Directory, { recursive: true });

const output = experimentV2(records, corpusHash);
const comparison: Record<string, unknown> = {};
for (const [horizon, v2Result] of Object.entries(output.results) as [string, any][]) {
  const v1Result = resultsV1.results[horizon];
  const validationV1 = v1Result.validation.ridge.find((entry: any) => entry.alpha === v1Result.validation.selectedAlpha).metrics;
  const validationV2 = v2Result.validation.ridge.find((entry: any) => entry.alpha === v2Result.validation.selectedAlpha).metrics;
  comparison[horizon] = {
    horizonDays: Number(horizon),
    validation: { v1: validationV1, v2: validationV2, maeChangePercent: 100 * (validationV2.MAE - validationV1.MAE) / validationV1.MAE },
    externalHoldout: { v1: v1Result.externalHoldout.ridge, v2: v2Result.externalHoldout.ridge, maeChangePercent: 100 * (v2Result.externalHoldout.ridge.MAE - v1Result.externalHoldout.ridge.MAE) / v1Result.externalHoldout.ridge.MAE },
    candidateV1: v1Result.candidate, candidateV2: v2Result.candidate,
  };
}
const results = { ...output, corpus: { ...output.corpus, file: manifestV1.corpus.file, sha256: corpusHash, source: manifestV1.source }, comparisonV1V2: comparison };
writeFileSync(resolve(v2Directory, 'results.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8');
writeFileSync(resolve(v2Directory, 'manifest.json'), `${JSON.stringify({ experimentId: output.experimentId, corpus: results.corpus, partitions: output.partitions, v1ResultsFile: 'docs/evidencias/hu-06-multihorizon/results.json', generatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');

const validationRows = Object.values(output.results).map((result: any) => {
  const ridge = result.validation.ridge.find((entry: any) => entry.alpha === result.validation.selectedAlpha).metrics; const baseline = result.validation.baselines[result.validation.baselineReference];
  return `| ${result.horizonDays} | ${result.validation.selectedAlpha} | ${result.validation.baselineReference} | ${ridge.MAE.toFixed(2)} | ${baseline.MAE.toFixed(2)} | ${ridge.RMSE.toFixed(2)} | ${ridge.bias.toFixed(2)} | ${ridge.WAPE.toFixed(6)} | ${result.candidate} |`;
}).join('\n');
const holdoutRows = Object.values(output.results).map((result: any) => {
  const ridge = result.externalHoldout.ridge; const baseline = result.externalHoldout.baselines[result.validation.baselineReference];
  return `| ${result.horizonDays} | ${result.validation.selectedAlpha} | ${result.validation.baselineReference} | ${ridge.MAE.toFixed(2)} | ${baseline.MAE.toFixed(2)} | ${ridge.RMSE.toFixed(2)} | ${ridge.bias.toFixed(2)} | ${ridge.WAPE.toFixed(6)} | ${result.externalHoldout.maeImprovementPercent.toFixed(4)}% | ${result.candidate} |`;
}).join('\n');

writeFileSync(resolve(v2Directory, 'README.md'), `# HU-06 — Experimento directo multi-horizonte V2\n\n## Hipótesis\n\nV1 no capturó suficiente dinámica reciente y todos sus horizontes incumplieron la regla catastrófica. V2 cambia únicamente las features. Conserva snapshot, particiones, baselines, grid alpha y promoción predefinida.\n\n## Features finales\n\n${orderedFeaturesV2.map(feature => `- \`${feature}\``).join('\n')}\n\nSe omitieron \`mean_3d\` y tendencia reciente por ser combinaciones lineales exactas de niveles ya presentes. Las ventanas terminan en t. Weekday del target es contexto calendario conocido y no una observación futura.\n\n## Protocolo preservado\n\nCorpus SHA-256 \`${corpusHash}\`; TRAIN ${output.partitions.train.start}..${output.partitions.train.end}; VALIDATION ${output.partitions.validation.start}..${output.partitions.validation.end}; HOLDOUT ${output.partitions.externalHoldout.start}..${output.partitions.externalHoldout.end}. Alpha y baseline se seleccionan solo con validation. El holdout se evalúa después sin reajuste.\n\n## Hallazgo de calidad\n\nEl holdout real contiene \`2026-09-28=138000 kWh\` y \`2026-09-29=11310 kWh\`, después de \`2026-09-27=217211045.44 kWh\`. Son valores finitos aceptados por el ruleset actual, pero producen errores máximos de 256–283 millones kWh, por encima del umbral predefinido de aproximadamente 135 millones. No se excluyeron, imputaron ni reinterpretaron después de observarlos. Debe verificarse su semántica/publicación con XM antes de repetir o promover el experimento.\n\nV2 permanece offline y no modifica runtime, catálogo, frontend, Oferta ni Precio. Ningún horizonte es candidato bajo el protocolo congelado.\n`, 'utf8');
writeFileSync(resolve(v2Directory, 'resultados.md'), `# Resultados HU-06 multi-horizonte V2\n\n## VALIDATION\n\n| h | alpha | baseline | MAE Ridge | MAE baseline | RMSE | Bias | WAPE | candidate final |\n|---:|---:|---|---:|---:|---:|---:|---:|---|\n${validationRows}\n\n## EXTERNAL HOLDOUT\n\n| h | alpha | baseline | MAE Ridge | MAE baseline | RMSE | Bias | WAPE | mejora MAE | candidate |\n|---:|---:|---|---:|---:|---:|---:|---:|---:|---|\n${holdoutRows}\n\nResultados completos y comparación V1/V2: [results.json](results.json).\n`, 'utf8');
writeFileSync(resolve(v2Directory, 'pruebas.md'), '# Pruebas V2\n\nEjecutar `bun test src/tests/hu06-multihorizon.test.ts`. Verifica hash, continuidad, features, h1/h7, anti-leakage, scaler TRAIN, selección VALIDATION, holdout aislado, métricas finitas, paridad y artefactos solo para candidate=true.\n', 'utf8');

for (const result of Object.values(output.results) as any[]) if (result.candidate) {
  const modelPath = resolve(root, `backend/src/models/${result.modelId}/1.0.0/model.json`); mkdirSync(dirname(modelPath), { recursive: true });
  const artifact = {
    modelId: result.modelId, modelVersion: result.modelVersion, algorithm: 'ridge', experimentVersion: 'v2', hyperparameters: { alpha: result.validation.selectedAlpha }, horizonDays: result.horizonDays,
    forecastOriginDefinition: result.originDefinition, targetDefinition: result.targetDefinition, orderedFeatures: result.orderedFeatures,
    coefficients: result.artifact.coefficients, intercept: result.artifact.intercept, scaler: { ddof: 0, means: result.artifact.means, standardDeviations: result.artifact.standardDeviations },
    trainingRange: result.ranges.train, validationRange: result.ranges.validation, externalHoldoutRange: result.ranges.externalHoldout, corpusHash,
    metrics: { validation: result.validation.ridge.find((entry: any) => entry.alpha === result.validation.selectedAlpha).metrics, externalHoldout: result.externalHoldout.ridge },
    baseline: { selectedOn: 'validation', reference: result.validation.baselineReference, validation: result.validation.baselines[result.validation.baselineReference], externalHoldout: result.externalHoldout.baselines[result.validation.baselineReference] },
    promotionCriteria: result.promotionCriteria, coefficientImportance: result.coefficientImportance,
    limitations: ['Experimental V2 artifact; not loaded by runtime.', 'Aggregated SIN demand; not individual or zonal demand.', 'No recursive forecasting or predicted features.', 'No weather, holidays, price or confidence interval.', 'Feature importance is descriptive, not causal or used for post-hoc selection.', 'Academic/formal validation pending.'],
  };
  writeFileSync(modelPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({ corpusHash, omittedCandidatesV2, candidates: Object.values(output.results).filter((result: any) => result.candidate).map((result: any) => result.modelId) }, null, 2));