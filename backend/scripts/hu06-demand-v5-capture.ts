import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '@/lib/prisma';
import { addDays, type DemandRecord } from '@/experiments/hu06-multihorizon';
import { buildV5Features, v5OrderedFeatures } from '@/experiments/hu06-demand-v5-preregistration';
import { appendV5ProspectivePrediction, prepareV5ProspectivePrediction } from '@/experiments/hu06-demand-v5-prospective';
import { predictV5Frozen } from '@/experiments/hu06-demand-v5-training';
import { readXmCoverage } from '@/services/xm-coverage.service';

const root = resolve(import.meta.dir, '..', '..');
const targetDate = process.argv[2];
if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw new Error('Usage: bun scripts/hu06-demand-v5-capture.ts YYYY-MM-DD');
const preregistration = JSON.parse(readFileSync(resolve(root, 'docs/evidencias/hu-06-demand-v5-preregistration/manifest.json'), 'utf8'));
const tag = 'hu06-v5-preregistered';
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
if (git('merge-base', `${tag}^{commit}`, 'HEAD') !== git('rev-parse', `${tag}^{commit}`)) throw new Error('V5_PREREGISTRATION_NOT_ANCESTOR');
const preregistrationPath = 'docs/evidencias/hu-06-demand-v5-preregistration/manifest.json';
if (readFileSync(resolve(root, preregistrationPath), 'utf8').replace(/\r\n/g, '\n').trimEnd() !== git('show', `${tag}:${preregistrationPath}`).replace(/\r\n/g, '\n').trimEnd()) throw new Error('V5_PREREGISTRATION_CHANGED');
const registryPath = resolve(root, preregistration.prospectiveRegistry.file);
const unavailable = (reason: string) => console.log(JSON.stringify({ status: 'unavailable', reason, targetDate, appended: 0 }));

try {
  const now = new Date();
  const coverage = await readXmCoverage('DemaSIN');
  const date = new Date(`${targetDate}T00:00:00Z`);
  const knownTarget = await prisma.xmIngestionWindow.findFirst({ where: { provider: 'xm', metric: 'DemaSIN', status: 'completed', receivedFrom: { lte: date }, receivedTo: { gte: date }, fetchedAt: { lte: now } }, select: { fetchedAt: true } });
  if (!coverage?.demandObservations) { unavailable('SOURCE_COVERAGE_MISSING'); }
  else if (targetDate <= coverage.latestReceivedDate || knownTarget) { unavailable(knownTarget?.fetchedAt && knownTarget.fetchedAt.toISOString() <= preregistration.preregistrationCutoff ? 'TARGET_KNOWN_AT_CUTOFF' : 'TARGET_ALREADY_RECEIVED'); }
  else {
    const records: DemandRecord[] = coverage.demandObservations.filter(row => row.date < targetDate).map(row => ({ fecha_xm: row.date, demanda_kwh: row.value }));
    let selected: ReturnType<typeof buildV5Features> = null;
    let origin: string | null = null, horizonDays = 0;
    for (const date of [...new Set(records.map(row => row.fecha_xm))].sort().reverse()) {
      const days = (Date.parse(`${targetDate}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000;
      if (days > 6) break;
      const built = buildV5Features(records, date, targetDate, days);
      if (built) { selected = built; origin = date; horizonDays = days; break; }
    }
    if (!origin || !selected) { unavailable('SOURCE_SEMANTIC_OR_HORIZON_UNAVAILABLE'); }
    else {
      const relative = `docs/evidencias/hu-06-demand-v5-frozen-models/h${horizonDays}.json`;
      const tracked = git('ls-files', '--', relative).trim();
      const committed = tracked ? git('show', `HEAD:${relative}`).replace(/\r\n/g, '\n').trimEnd() : '';
      if (!committed) { unavailable('FROZEN_MODEL_NOT_COMMITTED'); }
      else {
        const content = readFileSync(resolve(root, relative), 'utf8').replace(/\r\n/g, '\n').trimEnd();
        if (content !== committed) throw new Error('FROZEN_MODEL_CHANGED');
        const model = JSON.parse(content);
        if (model.horizonDays !== horizonDays || model.state !== 'pendingProspectiveValidation' || model.preregistrationTag !== tag ||
            model.preregistrationCommit !== git('rev-parse', `${tag}^{commit}`) || model.preregistrationCutoff !== preregistration.preregistrationCutoff ||
            model.corpusHash !== preregistration.corpus.sha256 || model.modelId !== `xm-demandasin-ridge-direct-h${horizonDays}-v5` ||
            JSON.stringify(model.orderedFeatures) !== JSON.stringify(v5OrderedFeatures) || model.coefficients.length !== 16) throw new Error('FROZEN_MODEL_INCOMPATIBLE');
        const consolidated = await prisma.xmConsolidatedDataset.findFirst({ where: { metric: 'DemaSIN' }, orderBy: [{ requestedTo: 'desc' }, { id: 'desc' }], select: { sources: { select: { xmIngestionWindow: { select: { id: true, status: true, fetchedAt: true, requestedFrom: true, requestedTo: true, energyDatasetId: true, contentHash: true } } } } } });
        const windows = consolidated?.sources.map(item => item.xmIngestionWindow) ?? [];
        const acquisitions = selected.featureDates.map(date => {
          const matching = windows.filter(row => row.requestedFrom.toISOString().slice(0, 10) <= date && row.requestedTo.toISOString().slice(0, 10) >= date);
          if (matching.length !== 1 || matching[0]!.status !== 'completed' || !matching[0]!.fetchedAt || !matching[0]!.energyDatasetId || !matching[0]!.contentHash) return null;
          const row = matching[0]!;
          return { date, fetchedAt: row.fetchedAt!.toISOString(), sourceDatasetId: row.energyDatasetId! };
        });
        if (acquisitions.some(row => !row || row.fetchedAt <= preregistration.preregistrationCutoff || row.fetchedAt > now.toISOString())) { unavailable('SOURCE_ACQUISITION_NOT_PROSPECTIVE'); }
        else {
          const earliest = now.toISOString();
          const prediction = predictV5Frozen({ alpha: model.selectedAlpha, coefficients: model.coefficients, intercept: model.intercept, means: model.scaler.means, standardDeviations: model.scaler.standardDeviations }, selected.values);
          const candidate = prepareV5ProspectivePrediction({ records, origin, targetDate, horizonDays, modelId: model.modelId, modelVersion: model.modelVersion,
            prediction, generatedAt: earliest, targetUnknownAtCutoff: coverage.latestReceivedDate < targetDate,
            targetUnknownAtGeneration: coverage.latestReceivedDate < targetDate, sourceAcquisitions: acquisitions as NonNullable<typeof acquisitions[number]>[] });
          const latest = await readXmCoverage('DemaSIN');
          if (!latest || latest.latestReceivedDate >= targetDate) { unavailable('TARGET_BECAME_KNOWN'); }
          else {
            mkdirSync(resolve(root, 'docs/evidencias/hu-06-demand-v5-prospective'), { recursive: true });
            const entry = appendV5ProspectivePrediction(registryPath, candidate);
            console.log(JSON.stringify({ status: 'captured', targetDate, origin, horizonDays, entryHash: entry.entryHash }));
          }
        }
      }
    }
  }
} finally { await prisma.$disconnect(); }