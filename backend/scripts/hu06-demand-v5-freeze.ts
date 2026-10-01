import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCsv, predict, verifyCorpus } from '@/experiments/hu06-multihorizon';
import { buildV5Features, v5OrderedFeatures } from '@/experiments/hu06-demand-v5-preregistration';
import { freezeV5Horizon, type V5TrainingProtocol } from '@/experiments/hu06-demand-v5-training';
import { demandSemanticRule } from '@/services/demand-semantic-eligibility';

const root = resolve(import.meta.dir, '..', '..');
const preregistrationTag = 'hu06-v5-preregistered';
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const preregistrationCommit = git('rev-parse', `${preregistrationTag}^{commit}`);
if (git('merge-base', preregistrationCommit, 'HEAD') !== preregistrationCommit) throw new Error('V5_PREREGISTRATION_NOT_ANCESTOR');
for (const path of ['docs/evidencias/hu-06-demand-v5-preregistration/manifest.json', 'docs/evidencias/hu-06-demand-v5-preregistration/README.md', 'docs/evidencias/hu-06-demand-v5-preregistration/protocol.md', 'backend/src/experiments/hu06-demand-v5-preregistration.ts']) {
  const current = readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n').trimEnd();
  if (current !== git('show', `${preregistrationTag}:${path}`).replace(/\r\n/g, '\n').trimEnd()) throw new Error(`V5_FROZEN_SOURCE_CHANGED: ${path}`);
}
const manifest = JSON.parse(readFileSync(resolve(root, 'docs/evidencias/hu-06-demand-v5-preregistration/manifest.json'), 'utf8')) as V5TrainingProtocol & {
  state: string; preregistrationCutoff: string;
  scope: { trained: boolean; evaluated: boolean; runtimeIntegration: boolean; horizonDays: number[]; excludedHorizonDays: number[] };
  corpus: { file: string; sha256: string; range: { start: string; end: string }; observations: number };
  primaryVariant: { orderedFeatures: string[] }; semanticPolicy: Record<string, unknown>;
};
const corpusBytes = readFileSync(resolve(root, manifest.corpus.file));
const corpusHash = createHash('sha256').update(corpusBytes).digest('hex');
if (corpusHash !== manifest.corpus.sha256 || corpusHash !== '18fd5aad3fe12eaa5290dba9ea551ccaef1a2baf4f41febf0c0354f0252c1735' ||
    manifest.state !== 'pendingProspectiveValidation' || manifest.scope.trained || manifest.scope.evaluated || manifest.scope.runtimeIntegration ||
    JSON.stringify(manifest.scope.horizonDays) !== JSON.stringify([1, 2, 3, 4, 5, 6]) || JSON.stringify(manifest.scope.excludedHorizonDays) !== '[7]' ||
    JSON.stringify(manifest.primaryVariant.orderedFeatures) !== JSON.stringify(v5OrderedFeatures) ||
    JSON.stringify(manifest.selection.alphaGrid) !== JSON.stringify([0.01, 0.1, 1, 10, 100]) ||
    JSON.stringify(manifest.selection.baselines) !== JSON.stringify(['B_ORIGIN', 'B_ORIGIN_MINUS_6', 'B_TRAIN_TARGET_WEEKDAY_MEAN']) ||
    JSON.stringify(Object.fromEntries(Object.entries(demandSemanticRule).map(([key, value]) => [key, manifest.semanticPolicy[key] === value]))) !== JSON.stringify(Object.fromEntries(Object.keys(demandSemanticRule).map(key => [key, true])))) throw new Error('V5_FROZEN_PROTOCOL_MISMATCH');

const records = parseCsv(corpusBytes.toString('utf8'));
const verified = verifyCorpus(records);
if (verified.firstDate !== manifest.corpus.range.start || verified.lastDate !== manifest.corpus.range.end || verified.observations !== manifest.corpus.observations) throw new Error('V5_FROZEN_CORPUS_MISMATCH');
const outputPath = resolve(root, 'docs/evidencias/hu-06-demand-v5-frozen-models');
if (existsSync(outputPath)) throw new Error('V5_FROZEN_MODELS_ALREADY_EXIST');

const adjustment = records.filter(record => record.fecha_xm <= manifest.partitions.validation.end);
const results = manifest.scope.horizonDays.map((horizonDays: number) => {
  const selected = freezeV5Horizon(adjustment, manifest, horizonDays);
  const provenance = (samples: typeof selected.train) => samples.map(row => ({ forecastOriginDate: row.forecastOriginDate, targetDate: row.targetDate,
    actualSourceDates: row.actualSourceDates, oldestDate: row.oldestDate, newestDate: row.newestDate, count: row.count, calendarSpanDays: row.calendarSpanDays,
    featureSourceDates: row.featureDates }));
  const artifact = {
    modelId: `xm-demandasin-ridge-direct-h${horizonDays}-v5`, modelVersion: 'hu06-demand-v5-c-primary@1.0.0', horizonDays,
    state: 'pendingProspectiveValidation', academicValidation: 'pending', modelFamily: 'independent_direct_ridge',
    preregistrationCommit, preregistrationTag, preregistrationCutoff: manifest.preregistrationCutoff,
    corpusHash, semanticPolicy: manifest.semanticPolicy, orderedFeatures: v5OrderedFeatures,
    trainingRange: manifest.partitions.train, validationRange: manifest.partitions.validation,
    selectedAlpha: selected.selectedAlpha, baselineReference: selected.baselineReference,
    scaler: { ddof: 0, means: selected.fittedParameters.means, standardDeviations: selected.fittedParameters.standardDeviations },
    coefficients: selected.fittedParameters.coefficients, intercept: selected.fittedParameters.intercept,
    samples: { train: selected.train.length, validation: selected.validation.length },
    trainingSourceProvenance: provenance(selected.train), validationSourceProvenance: provenance(selected.validation),
    validationMetrics: selected.validationMetrics, baselineValidationMetrics: selected.baselineValidation,
    statusOfPromotion: 'not_evaluated_prospectively',
  };
  return { horizonDays, selected, artifact };
});

const dryRun = [5, 6].map(horizonDays => {
  const origin = '2026-09-27', targetDate = horizonDays === 5 ? '2026-10-02' : '2026-10-03';
  const features = buildV5Features(records.filter(row => row.fecha_xm <= origin), origin, targetDate, horizonDays);
  if (!features || features.values.length !== 16) throw new Error('V5_DRY_RUN_SOURCE_UNAVAILABLE');
  const frozen = results.find(result => result.horizonDays === horizonDays)!;
  const prediction = predict(frozen.selected.fittedParameters, features.values);
  if (!Number.isFinite(prediction)) throw new Error('V5_DRY_RUN_NONFINITE');
  return { status: 'pre_prospective_dry_run_not_valid_evidence', forecastOriginDate: origin, targetDate, horizonDays,
    modelId: frozen.artifact.modelId, modelVersion: frozen.artifact.modelVersion, featureSourceDates: features.featureDates,
    actualSourceDates: features.actualSourceDates, oldestDate: features.oldestDate, newestDate: features.newestDate,
    count: features.count, calendarSpanDays: features.calendarSpanDays, vectorFinite: features.values.every(Number.isFinite), predictionCalculable: true,
    prediction: { demanda_kwh: prediction }, isProspectivePrediction: false };
});

mkdirSync(outputPath);
const write = (name: string, value: string) => writeFileSync(resolve(outputPath, name), value, { encoding: 'utf8', flag: 'wx' });
for (const result of results) write(`h${result.horizonDays}.json`, `${JSON.stringify(result.artifact, null, 2)}\n`);
write('validation-report.json', `${JSON.stringify({ status: 'TRAIN_VALIDATION_ONLY', corpusHash, preregistrationTag, preregistrationCommit,
  partitionsUsed: { train: manifest.partitions.train, validation: manifest.partitions.validation }, retrospectiveEvaluationUsed: false,
  horizons: results.map(({ horizonDays, selected, artifact }) => ({ horizonDays, modelId: artifact.modelId, modelVersion: artifact.modelVersion,
    samples: artifact.samples, alpha: selected.selectedAlpha, baselineReference: selected.baselineReference,
    alphaValidationGrid: selected.alphaValidationGrid, baselineValidationGrid: selected.baselineValidationGrid,
    MAE: selected.validationMetrics.MAE, RMSE: selected.validationMetrics.RMSE, Bias: selected.validationMetrics.bias,
    WAPE: selected.validationMetrics.WAPE, maxAbsoluteError: selected.validationMetrics.maxAbsoluteErrorKwh,
    unavailable: selected.validationMetrics.unavailable })) }, null, 2)}\n`);
write('dry-run.json', `${JSON.stringify({ status: 'NOT_PROSPECTIVE_EVIDENCE', preregistrationCutoff: manifest.preregistrationCutoff, predictions: dryRun }, null, 2)}\n`);
write('README.md', `# HU-06 Demanda V5: modelos experimentales congelados\n\nFuente: tag \`${preregistrationTag}\`, commit \`${preregistrationCommit}\`; cutoff \`${manifest.preregistrationCutoff}\`. Corpus SHA-256 \`${corpusHash}\`. [h1](h1.json), [h2](h2.json), [h3](h3.json), [h4](h4.json), [h5](h5.json), [h6](h6.json) son modelos Ridge independientes **fuera del runtime**. Ningún h7, fallback ni integración. Cada archivo conserva parámetros, TRAIN/VALIDATION y fechas fuente de las muestras; no se leyó RETROSPECTIVE EVALUATION para decidir.\n\n[validation-report.json](validation-report.json) contiene exclusivamente métricas VALIDATION, grid alpha y baselines. No implica calidad prospectiva, sustitución de V2, ni validación académica. [dry-run.json](dry-run.json) contiene solo una prueba computacional h5/h6 del origen 27/09; **no es predicción prospectiva válida**, y no se agregó ningún registro al journal. Antes de cualquier captura hay que demostrar target aún desconocido y adquisición de fuentes posterior al cutoff aplicable, además de congelar la identidad de estos seis modelos.\n`);
console.log(JSON.stringify({ preregistrationCommit, tag: preregistrationTag, corpusHash, horizons: results.map(({ horizonDays, selected }) => ({ horizonDays, alpha: selected.selectedAlpha, baseline: selected.baselineReference, train: selected.train.length, validation: selected.validation.length })), dryRun: dryRun.map(value => ({ h: value.horizonDays, calculable: value.predictionCalculable })), retrospectiveEvaluationUsed: false }));