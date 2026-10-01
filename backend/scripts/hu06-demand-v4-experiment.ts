import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { addDays, parseCsv, verifyCorpus } from '@/experiments/hu06-multihorizon';
import { buildV4Primary, v4PrimaryFeatures } from '@/experiments/hu06-demand-v4-preregistration';
import { experimentDemandV4, type V4ExperimentManifest } from '@/experiments/hu06-demand-v4-experiment';
import { predict } from '@/experiments/hu06-multihorizon';

const root = resolve(import.meta.dir, '..', '..'), tag = 'hu06-v4-preregistered';
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const commit = git('rev-parse', 'HEAD');
if (git('rev-parse', `${tag}^{commit}`) !== commit) throw new Error('HEAD is not the frozen HU-06 V4 tag.');
const frozen = ['docs/evidencias/hu-06-demand-v4-preregistration/manifest.json', 'docs/evidencias/hu-06-demand-v4-preregistration/protocol.md', 'docs/evidencias/hu-06-demand-v4-preregistration/README.md', 'backend/src/experiments/hu06-demand-v4-preregistration.ts'];
for (const path of frozen) if (readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n').trimEnd() !== git('show', `${tag}:${path}`).replace(/\r\n/g, '\n').trimEnd()) throw new Error(`Frozen preregistration changed: ${path}`);

const manifest = JSON.parse(readFileSync(resolve(root, frozen[0]!), 'utf8')) as V4ExperimentManifest & {
  experimentId: string; state: string; preregistrationCutoff: string; selection: V4ExperimentManifest['selection'] & { primaryVariant: 'A' };
  scope: { horizonDays: number[]; excludedHorizonDays: number[]; trained: boolean; evaluationPerformed: boolean; runtimeIntegration: boolean };
  variants: { A: { orderedFeatures: string[] } }; semanticPolicy: unknown;
  operationalCase: V4ExperimentManifest['operationalCase'] & { asOf: string; futureHorizonsAsOfDate: number[] };
};
const corpusBytes = readFileSync(resolve(root, 'docs/evidencias/hu-06-multihorizon/corpus/xm-demandasin-2024-01-01_2026-09-29.csv'));
const corpusHash = createHash('sha256').update(corpusBytes).digest('hex');
if (manifest.state !== 'pendingExperiment' || manifest.scope.trained || manifest.scope.evaluationPerformed || manifest.scope.runtimeIntegration ||
    JSON.stringify(manifest.scope.horizonDays) !== JSON.stringify([1, 2, 3, 4, 5, 6]) || JSON.stringify(manifest.scope.excludedHorizonDays) !== '[7]' ||
    manifest.selection.primaryVariant !== 'A' || JSON.stringify(manifest.variants.A.orderedFeatures) !== JSON.stringify(v4PrimaryFeatures) ||
    corpusHash !== '18fd5aad3fe12eaa5290dba9ea551ccaef1a2baf4f41febf0c0354f0252c1735' || corpusHash !== manifest.corpus.sha256 ||
    manifest.partitions.retrospectiveEvaluation.virginHoldout !== false) throw new Error('Frozen V4 protocol mismatch.');
const records = parseCsv(corpusBytes.toString('utf8')), verified = verifyCorpus(records);
if (verified.firstDate !== manifest.corpus.range.start || verified.lastDate !== manifest.corpus.range.end || verified.observations !== manifest.corpus.observations) throw new Error('Frozen V4 corpus identity mismatch.');
const evidencePath = resolve(root, 'docs/evidencias/hu-06-demand-v4-experiment');
if (existsSync(evidencePath)) throw new Error('V4 experiment evidence exists; refusing to overwrite or reselect.');

const evaluation = experimentDemandV4(records, manifest);
const offlinePredictions = manifest.operationalCase.futureHorizonsAsOfDate.map(horizonDays => {
  const origin = manifest.operationalCase.candidateOrigin, targetDate = manifest.operationalCase.targetsByHorizon[String(horizonDays)]!;
  if (origin !== '2026-09-27' || targetDate !== addDays(origin, horizonDays) || targetDate <= manifest.operationalCase.asOf || targetDate <= verified.lastDate) throw new Error('Invalid offline prediction timing.');
  const built = buildV4Primary(records, origin, targetDate, horizonDays);
  if (!built) return { origin, targetDate, horizonDays, status: 'unavailable' as const };
  const model = evaluation.variants.A[String(horizonDays)]!;
  if (!model.fittedParameters) throw new Error('Missing frozen offline A parameters.');
  const predicted = predict(model.fittedParameters, built.values);
  if (!Number.isFinite(predicted)) throw new Error('Invalid offline A prediction.');
  return { status: 'offline_experimental_only' as const, origin, targetDate, horizonDays, modelId: model.modelId, modelVersion: model.modelVersion,
    orderedFeatures: built.orderedFeatures, features: built.values, sourceDates: built.featureDates, prediction: { demanda_kwh: predicted }, unit: 'kWh' as const };
});

const output = { experimentId: manifest.experimentId, preregistrationTag: tag, preregistrationCommit: commit, preregistrationCutoff: manifest.preregistrationCutoff,
  generatedAt: new Date().toISOString(), status: 'retrospective_technical_experiment',
  corpus: { file: 'docs/evidencias/hu-06-multihorizon/corpus/xm-demandasin-2024-01-01_2026-09-29.csv', sha256: corpusHash, observations: verified.observations },
  partitions: manifest.partitions, promotionCriteria: manifest.promotionCriteria, predictiveQualityAndOperationalCoverage: evaluation,
  offlinePredictions, limitations: ['The previously observed retrospective block is not a virgin external holdout.',
    'No A/C/ablation runtime model is integrated; offline examples are not production forecasts or academic validation.',
    'Replacement requires 60 complete prospective target days per horizon after preregistration; current count is zero.'] };
const summary = (variant: 'A' | 'B' | 'C') => Array.from({ length: 6 }, (_, index) => {
  const horizonDays = index + 1, result = evaluation.variants[variant][String(horizonDays)]!, quality = result.predictiveQuality.retrospectiveEvaluation;
  return `| ${variant} | ${horizonDays} | ${result.sampleCounts.train}/${result.sampleCounts.validation}/${result.sampleCounts.retrospectiveEvaluation} | ${result.operationalCoverage.constructibleOrigins.length} | ${result.operationalCoverage.constructibleFutureTargets.length} | ${result.selection.selectedAlpha} | ${result.selection.baselineReference} | ${quality.MAE.toFixed(2)} | ${quality.RMSE.toFixed(2)} | ${quality.bias.toFixed(2)} | ${quality.WAPE.toFixed(4)} | ${quality.maxAbsoluteErrorKwh.toFixed(2)} | ${result.predictiveQuality.catastrophicThresholdKwh.toFixed(2)} | ${quality.unavailable} |`;
}).join('\n');
const paired = Array.from({ length: 6 }, (_, index) => evaluation.paired[String(index + 1)]!).map(row => `| ${row.horizonDays} | ${row.pairedTargetDays} | ${row.MAE_A_paired.toFixed(2)} | ${row.MAE_V2_paired.toFixed(2)} | ${row.WAPE_A_paired.toFixed(4)} | ${row.WAPE_V2_paired.toFixed(4)} | ${row.pairedQuality} | ${row.greaterCoverage} | ${row.replacementCandidate} |`).join('\n');
const ablation = Array.from({ length: 6 }, (_, index) => evaluation.independentAblation[String(index + 1)]!).map(row => `| ${row.horizonDays} | ${row.sampleCounts.train}/${row.sampleCounts.validation}/${row.sampleCounts.retrospectiveEvaluation} | ${row.selection.selectedAlpha} | ${row.selection.baselineReference} | ${row.predictiveQuality.retrospectiveEvaluation.MAE.toFixed(2)} | ${row.operationalCoverage.constructibleOrigins.length} |`).join('\n');

mkdirSync(evidencePath);
const write = (name: string, contents: string) => writeFileSync(resolve(evidencePath, name), contents, { encoding: 'utf8', flag: 'wx' });
write('results.json', `${JSON.stringify(output, null, 2)}\n`);
write('corpus-reference.json', `${JSON.stringify({ preregistrationTag: tag, preregistrationCommit: commit, file: output.corpus.file, sha256: corpusHash, range: manifest.corpus.range, observations: verified.observations, semanticPolicy: manifest.semanticPolicy, partitions: manifest.partitions }, null, 2)}\n`);
write('resultados.md', `# HU-06 Demanda V4: resultados retrospectivos técnicos\n\nEvaluación sobre bloque **RETROSPECTIVE EVALUATION**, ya observado al diseñar la regla semántica; no es external holdout virgen. A es la única variante primaria; B es V2 congelado y C es comparador separado. No escoger C o la ablación después de ver resultados. Calidad y cobertura no se sustituyen entre sí.\n\n## Calidad predictiva y cobertura operativa, separadas por horizonte\n\nLa columna orígenes corresponde únicamente al caso de capacidad preregistrado 17..27/09; no es número de aciertos. Fechas fuente de cada estadística C y su span real: [results.json](results.json).\n\n| Variante | h | TRAIN/VALIDATION/RETROSPECTIVE | Orígenes | Targets futuros | Alpha | Baseline | MAE | RMSE | Bias | WAPE % | Error máximo | Umbral catastrófico | Unavailable |\n|---|---:|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|\n${['A', 'B', 'C'].map(value => summary(value as 'A' | 'B' | 'C')).join('\n')}\n\n## Comparación obligatoria A frente a V2 en las mismas muestras\n\n| h | Targets emparejados | MAE A | MAE V2 | WAPE A % | WAPE V2 % | Dentro de 1.05 | Más cobertura | replacementCandidate |\n|---:|---:|---:|---:|---:|---:|---|---|---|\n${paired}\n\nEl criterio requiere además calidad técnica frente al baseline y 60 target days prospectivos completos por horizonte; ninguno está disponible aún.\n\n## Ablación target-relative independiente\n\n| h | TRAIN/VALIDATION/RETROSPECTIVE | Alpha | Baseline | MAE retrospectivo | Orígenes |\n|---:|---|---:|---|---:|---:|\n${ablation}\n\nNo reemplaza A, no constituye selección de variante y no se integra al runtime. Predicciones experimentales offline, si las fuentes fueron elegibles: [results.json](results.json).\n`);
write('README.md', `# HU-06 Demanda V4: experimento offline\n\nPreregistración inmutable en tag \`${tag}\`, commit \`${commit}\`, cutoff \`${manifest.preregistrationCutoff}\`. Fuente: [corpus-reference.json](corpus-reference.json). Detalle completo: [results.json](results.json); tablas de [resultados](resultados.md). No se modificaron preregistración, runtime, modelos V2, frontend ni otros pilares.\n\nA (puntual V1-like) es la única hipótesis primaria; B es comparador V2 congelado; C usa últimas observaciones USABLE con fechas/span por muestra. La ablación target-relative se calcula por separado. Alpha y baseline se seleccionaron solo con VALIDATION y ajuste TRAIN. Las métricas retrospectivas son técnicas, no validación académica ni holdout virgen. \`replacementCandidate\` exige prospectiva suficiente, que sigue pendiente. Las predicciones h5/h6 sobre origen 27/09 son solo evidencias offline, no runtime operativo ni pronósticos productivos.\n`);
console.log(JSON.stringify({ commit, corpusHash, files: ['results.json', 'corpus-reference.json', 'resultados.md', 'README.md'], offlinePredictions: offlinePredictions.map(row => ({ horizonDays: row.horizonDays, status: row.status })), replacementCandidates: Object.values(evaluation.paired).map(row => row.replacementCandidate) }));