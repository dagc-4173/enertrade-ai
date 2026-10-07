import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '@/lib/prisma';
import { addDays, type DemandRecord } from '@/experiments/hu06-multihorizon';
import { buildV5Features, v5OrderedFeatures } from '@/experiments/hu06-demand-v5-preregistration';
import { appendV5ProspectivePrediction, prepareV5ProspectivePrediction, verifyV5ProspectiveJournal } from '@/experiments/hu06-demand-v5-prospective';
import { findLatestV5ClosedOrigin, resolveV5SourceAcquisitions, v5LocalDate, v5TargetGate } from '@/experiments/hu06-demand-v5-capture-gates';
import { predictV5Frozen } from '@/experiments/hu06-demand-v5-training';
import { readXmCoverage } from '@/services/xm-coverage.service';

const root = resolve(import.meta.dir, '..', '..');
const argument = process.argv[2];
const preflight = argument === '--preflight';
if (!argument || (!preflight && !/^\d{4}-\d{2}-\d{2}$/.test(argument))) throw new Error('Usage: bun scripts/hu06-demand-v5-capture.ts YYYY-MM-DD | --preflight');
const preregistration = JSON.parse(readFileSync(resolve(root, 'docs/evidencias/hu-06-demand-v5-preregistration/manifest.json'), 'utf8'));
const tag = 'hu06-v5-preregistered';
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
if (git('merge-base', `${tag}^{commit}`, 'HEAD') !== git('rev-parse', `${tag}^{commit}`)) throw new Error('V5_PREREGISTRATION_NOT_ANCESTOR');
const preregistrationPath = 'docs/evidencias/hu-06-demand-v5-preregistration/manifest.json';
if (readFileSync(resolve(root, preregistrationPath), 'utf8').replace(/\r\n/g, '\n').trimEnd() !== git('show', `${tag}:${preregistrationPath}`).replace(/\r\n/g, '\n').trimEnd()) throw new Error('V5_PREREGISTRATION_CHANGED');
const registryPath = resolve(root, preregistration.prospectiveRegistry.file);

function readFrozenModel(horizonDays: number) {
  const relative = `docs/evidencias/hu-06-demand-v5-frozen-models/h${horizonDays}.json`;
  if (!git('ls-files', '--', relative).trim()) throw new Error('FROZEN_MODEL_NOT_COMMITTED');
  const committed = git('show', `HEAD:${relative}`).replace(/\r\n/g, '\n').trimEnd();
  const content = readFileSync(resolve(root, relative), 'utf8').replace(/\r\n/g, '\n').trimEnd();
  if (content !== committed) throw new Error('FROZEN_MODEL_CHANGED');
  const model = JSON.parse(content);
  if (model.horizonDays !== horizonDays || model.state !== 'pendingProspectiveValidation' || model.preregistrationTag !== tag ||
      model.preregistrationCommit !== git('rev-parse', `${tag}^{commit}`) || model.preregistrationCutoff !== preregistration.preregistrationCutoff ||
      model.corpusHash !== preregistration.corpus.sha256 || model.modelId !== `xm-demandasin-ridge-direct-h${horizonDays}-v5` ||
      model.modelVersion !== 'hu06-demand-v5-c-primary@1.0.0' || JSON.stringify(model.orderedFeatures) !== JSON.stringify(v5OrderedFeatures) ||
      !preregistration.selection.alphaGrid.includes(model.selectedAlpha) || !preregistration.selection.baselines.includes(model.baselineReference) ||
      [model.coefficients, model.scaler?.means, model.scaler?.standardDeviations].some(vector => !Array.isArray(vector) || vector.length !== 16 || !vector.every(Number.isFinite)) ||
      model.scaler.ddof !== 0 || model.scaler.standardDeviations.some((value: number) => value <= 0) || !Number.isFinite(model.intercept)) throw new Error('FROZEN_MODEL_INCOMPATIBLE');
  return model;
}

async function acquiredTarget(targetDate: string) {
  const date = new Date(`${targetDate}T00:00:00Z`);
  return prisma.xmIngestionWindow.findFirst({ where: { provider: 'xm', metric: 'DemaSIN', status: 'completed', receivedFrom: { lte: date }, receivedTo: { gte: date } }, orderBy: { fetchedAt: 'asc' }, select: { fetchedAt: true } });
}

try {
  const existing = verifyV5ProspectiveJournal(registryPath);
  const coverage = await readXmCoverage('DemaSIN');
  if (!coverage?.demandObservations) { console.log(JSON.stringify({ status: 'unavailable', reason: 'SOURCE_COVERAGE_MISSING', appended: 0 })); }
  else {
    const records: DemandRecord[] = coverage.demandObservations.map(row => ({ fecha_xm: row.date, demanda_kwh: row.value }));
    const now = new Date();
    const origin = findLatestV5ClosedOrigin(records, now);
    if (!origin) { console.log(JSON.stringify({ status: 'unavailable', reason: 'SOURCE_SEMANTIC_OR_HORIZON_UNAVAILABLE', appended: 0 })); }
    else {
      const consolidated = await prisma.xmConsolidatedDataset.findFirst({ where: { metric: 'DemaSIN' }, orderBy: [{ requestedTo: 'desc' }, { id: 'desc' }], select: { sources: { select: { xmIngestionWindow: { select: { id: true, status: true, fetchedAt: true, requestedFrom: true, requestedTo: true, energyDatasetId: true, contentHash: true } } } } } });
      const windows = consolidated?.sources.map(item => item.xmIngestionWindow) ?? [];
      const targets = preflight ? Array.from({ length: 6 }, (_, index) => addDays(origin, index + 1)) : [argument];
      const outcomes = [];
      for (const targetDate of targets) {
        const horizonDays = (Date.parse(`${targetDate}T00:00:00Z`) - Date.parse(`${origin}T00:00:00Z`)) / 86_400_000;
        const knownTarget = await acquiredTarget(targetDate);
        const generatedAt = new Date().toISOString();
        const targetGate = v5TargetGate({ targetDate, now: new Date(generatedAt), latestReceivedDate: coverage.latestReceivedDate,
          acquiredAt: knownTarget ? knownTarget.fetchedAt ?? new Date(generatedAt) : null, cutoff: preregistration.preregistrationCutoff });
        const supported = Number.isInteger(horizonDays) && horizonDays >= 1 && horizonDays <= 6;
        const selected = supported ? buildV5Features(records, origin, targetDate, horizonDays) : null;
        const sources = resolveV5SourceAcquisitions(selected?.featureDates ?? [], windows, generatedAt);
        const model = supported ? readFrozenModel(horizonDays) : null;
        const duplicate = model && existing.some(entry => entry.modelVersion === model.modelVersion && entry.forecastOriginDate === origin && entry.targetDate === targetDate && entry.horizonDays === horizonDays);
        const reason = targetGate.reason ?? (!supported ? 'V5_HORIZON_UNSUPPORTED' : !selected ? 'V5_SOURCE_UNAVAILABLE' :
          !sources.valid ? sources.reason : generatedAt <= preregistration.preregistrationCutoff ? 'GENERATED_AT_NOT_AFTER_CUTOFF' :
          duplicate ? 'DUPLICATE_V5_PROSPECTIVE_PREDICTION' : null);
        const outcome = { origin, target: targetDate, horizonDays, targetKnown: targetGate.targetKnown, targetFuture: targetGate.targetFuture,
          sourcesValid: Boolean(selected && sources.valid), status: reason ? 'unavailable' : 'ready', reason, appended: 0 };
        if (preflight || reason) { outcomes.push(outcome); continue; }
        if (selected && model && sources.valid) {
          const prediction = predictV5Frozen({ alpha: model.selectedAlpha, coefficients: model.coefficients, intercept: model.intercept, means: model.scaler.means, standardDeviations: model.scaler.standardDeviations }, selected.values);
          const candidate = prepareV5ProspectivePrediction({ records, origin, targetDate, horizonDays, modelId: model.modelId, modelVersion: model.modelVersion,
            prediction, generatedAt, targetUnknownAtCutoff: !targetGate.targetKnown,
            targetUnknownAtGeneration: !targetGate.targetKnown, sourceAcquisitions: sources.acquisitions });
          const latest = await readXmCoverage('DemaSIN');
          const acquiredAgain = await acquiredTarget(targetDate);
          if (!latest || latest.latestReceivedDate >= targetDate || acquiredAgain || targetDate <= v5LocalDate(new Date())) {
            outcomes.push({ ...outcome, status: 'unavailable', reason: 'TARGET_BECAME_KNOWN_OR_NOT_FUTURE' });
          }
          else {
            mkdirSync(resolve(root, 'docs/evidencias/hu-06-demand-v5-prospective'), { recursive: true });
            const entry = appendV5ProspectivePrediction(registryPath, candidate);
            verifyV5ProspectiveJournal(registryPath);
            outcomes.push({ ...outcome, status: 'captured', appended: 1, entryHash: entry.entryHash });
          }
        }
      }
      console.log(JSON.stringify({ mode: preflight ? 'preflight_no_append' : 'capture', checkedAt: new Date().toISOString(),
        coverage: { latestReceivedDate: coverage.latestReceivedDate, latestIndividuallyUsableDate: coverage.latestIndividuallyUsableDate, semanticExcludedDates: coverage.semanticExcludedDates }, outcomes }));
    }
  }
} finally { await prisma.$disconnect(); }