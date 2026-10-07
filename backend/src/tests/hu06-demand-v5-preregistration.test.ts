import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, parseCsv, type DemandRecord } from '@/experiments/hu06-multihorizon';
import { buildV4UsableStatisticsComparator, v4UsableStatisticsFeatures } from '@/experiments/hu06-demand-v4-preregistration';
import { buildV5Features, v5OrderedFeatures, v5UsableStatisticsWindow } from '@/experiments/hu06-demand-v5-preregistration';
import { appendV5ProspectivePrediction, prepareV5ProspectivePrediction, verifyV5ProspectiveJournal, v5PreregistrationCutoff } from '@/experiments/hu06-demand-v5-prospective';
import { demandEligibilityIndex, demandSemanticRule } from '@/services/demand-semantic-eligibility';
import { loadDirectDemandV5Model } from '@/models/xm-demandasin-ridge-direct-v5/model-loader';

const root = new URL('../../../docs/evidencias/hu-06-demand-v5-preregistration/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const corpus = readFileSync(new URL('../../../docs/evidencias/hu-06-multihorizon/corpus/xm-demandasin-2024-01-01_2026-09-29.csv', import.meta.url));
const records = parseCsv(corpus.toString('utf8'));

test('V5 freezes exactly C features, historical corpus and prospective status without evaluating V4', () => {
  expect(manifest.primaryVariant.orderedFeatures).toEqual(v5OrderedFeatures);
  expect(v5OrderedFeatures).toEqual(v4UsableStatisticsFeatures);
  expect(manifest.primaryVariant.usableStatisticObservationsRequired).toBe(28);
  expect(manifest.primaryVariant.maxCalendarLookbackDaysInclusive).toBe(42);
  expect(v5UsableStatisticsWindow).toEqual({ count: 28, maxCalendarDays: 42 });
  expect(createHash('sha256').update(corpus).digest('hex')).toBe(manifest.corpus.sha256);
  expect(manifest.semanticPolicy).toMatchObject(demandSemanticRule);
  expect(manifest.preregistrationCutoff).toBe(v5PreregistrationCutoff);
  expect(manifest.scope).toMatchObject({ horizonDays: [1, 2, 3, 4, 5, 6], excludedHorizonDays: [7], trained: false, evaluated: false, runtimeIntegration: false });
  expect(manifest.state).toBe('pendingProspectiveValidation');
  expect(manifest.historicalContext).toMatchObject({ v4CWasComparator: true, noPromotionFromV4: true, v4RetrospectiveMetricsAreIndependentV5Evidence: false });
});

test('V5 vector equals V4 C for every allowed direct horizon with no future feature dates', () => {
  for (let horizon = 1; horizon <= 6; horizon++) {
    const target = addDays('2026-09-27', horizon);
    const prior = buildV4UsableStatisticsComparator(records, '2026-09-27', target, horizon)!;
    const next = buildV5Features(records, '2026-09-27', target, horizon)!;
    expect(next.values).toEqual(prior.values);
    expect(next.orderedFeatures).toEqual(prior.orderedFeatures);
    expect(next.actualSourceDates).toEqual(prior.usableStatisticDates);
    expect(next.featureDates).toEqual(prior.featureDates);
    expect(next.actualSourceDates).toHaveLength(28);
    expect(next).toMatchObject({ oldestDate: '2026-08-30', newestDate: '2026-09-27', calendarSpanDays: 29, count: 28 });
    expect(next.featureDates.every(date => date <= next.forecastOriginDate)).toBe(true);
  }
  expect(() => buildV5Features(records, '2026-09-27', '2026-10-04', 7)).toThrow();
});

test('V5 C uses only USABLE observations and cannot impute a missing or excluded mandatory level', () => {
  const built = buildV5Features(records, '2026-09-27', '2026-10-02', 5)!;
  const eligibility = demandEligibilityIndex(records.filter(row => row.fecha_xm <= '2026-09-27').map(row => ({ date: row.fecha_xm, value: row.demanda_kwh })));
  expect(built.actualSourceDates.every(date => eligibility.get(date)?.semanticStatus === 'USABLE' && date >= '2026-08-17')).toBe(true);
  expect(built.actualSourceDates).not.toContain('2026-09-16');
  expect(built.calendarSpanDays).toBeLessThanOrEqual(42);
  expect(buildV5Features(records, '2026-09-23', '2026-09-24', 1)).toBeNull();
  expect(buildV5Features(records.filter(row => row.fecha_xm !== '2026-09-21'), '2026-09-27', '2026-10-02', 5)).toBeNull();
  const fixedDates = new Set([0, 1, 2, 6, 7, 13, 14, 27, 28].map(lag => addDays('2026-09-27', -lag)));
  const removed = new Set(records.filter(row => row.fecha_xm >= '2026-08-17' && row.fecha_xm <= '2026-09-27' && !fixedDates.has(row.fecha_xm) && row.fecha_xm !== '2026-09-16').slice(0, 14).map(row => row.fecha_xm));
  expect(removed.size).toBe(14);
  expect(buildV5Features(records.filter(row => !removed.has(row.fecha_xm)), '2026-09-27', '2026-10-02', 5)).toBeNull();
  const changedTarget: DemandRecord[] = [...records, { fecha_xm: '2026-10-02', demanda_kwh: Number.MAX_VALUE }];
  expect(buildV5Features(changedTarget, '2026-09-27', '2026-10-02', 5)).toEqual(built);
});

const fixtureOrigin = '2026-10-01';
const fixtureRows = Array.from({ length: 60 }, (_, index) => ({ fecha_xm: addDays(fixtureOrigin, index - 59), demanda_kwh: 220_000_000 + (index % 3) * 1_000_000 }));
function fixtureCandidate(targetDate: string, horizonDays: number) {
  const built = buildV5Features(fixtureRows, fixtureOrigin, targetDate, horizonDays)!;
  return prepareV5ProspectivePrediction({ records: fixtureRows, origin: fixtureOrigin, targetDate, horizonDays,
    modelId: `xm-demandasin-ridge-direct-h${horizonDays}-v5`, modelVersion: 'hu06-demand-v5-c-primary@1.0.0',
    prediction: 225_000_000, generatedAt: '2026-10-02T12:00:00.000Z', targetUnknownAtCutoff: true, targetUnknownAtGeneration: true,
    sourceAcquisitions: built.featureDates.map(date => ({ date, fetchedAt: '2026-10-01T18:00:00.000Z', sourceDatasetId: 1 })) });
}

test('future journal rejects known targets, early generation and unverified source acquisitions', () => {
  const base = fixtureCandidate('2026-10-03', 2);
  expect(base).toMatchObject({ forecastOriginDate: fixtureOrigin, count: 28, preregistrationCutoff: v5PreregistrationCutoff });
  expect(base.featureSnapshotHash).toMatch(/^[a-f0-9]{64}$/);
  const input = { records: fixtureRows, origin: fixtureOrigin, targetDate: '2026-10-03', horizonDays: 2,
    modelId: base.modelId, modelVersion: base.modelVersion, prediction: base.prediction.demanda_kwh,
    generatedAt: base.generatedAt, targetUnknownAtCutoff: true, targetUnknownAtGeneration: true, sourceAcquisitions: base.sourceAcquisitions };
  expect(() => prepareV5ProspectivePrediction({ ...input, targetUnknownAtCutoff: false })).toThrow('V5_PROSPECTIVE_NOT_VERIFIED');
  expect(() => prepareV5ProspectivePrediction({ ...input, targetUnknownAtGeneration: false })).toThrow('V5_PROSPECTIVE_NOT_VERIFIED');
  expect(() => prepareV5ProspectivePrediction({ ...input, generatedAt: v5PreregistrationCutoff })).toThrow('V5_PROSPECTIVE_NOT_VERIFIED');
  expect(() => prepareV5ProspectivePrediction({ ...input, generatedAt: '2026-10-02T02:00:00.000Z' })).toThrow('V5_PROSPECTIVE_NOT_VERIFIED');
  expect(() => prepareV5ProspectivePrediction({ ...input, sourceAcquisitions: input.sourceAcquisitions.slice(1) })).toThrow('V5_SOURCE_ACQUISITION_NOT_VERIFIED');
  expect(() => prepareV5ProspectivePrediction({ ...input, sourceAcquisitions: input.sourceAcquisitions.map(row => ({ ...row, fetchedAt: '2026-10-03T00:00:00.000Z' })) })).toThrow('V5_SOURCE_ACQUISITION_NOT_VERIFIED');
});

test('temporary JSONL remains append-only, hash-chained, immutable and idempotent', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hu06-v5-')), path = join(directory, 'predictions.jsonl');
  try {
    const first = appendV5ProspectivePrediction(path, fixtureCandidate('2026-10-03', 2));
    const snapshot = readFileSync(path, 'utf8');
    expect(first.previousEntryHash).toBeNull();
    expect(() => appendV5ProspectivePrediction(path, fixtureCandidate('2026-10-03', 2))).toThrow('DUPLICATE_V5_PROSPECTIVE_PREDICTION');
    expect(readFileSync(path, 'utf8')).toBe(snapshot);
    const second = appendV5ProspectivePrediction(path, fixtureCandidate('2026-10-04', 3));
    expect(second.previousEntryHash).toBe(first.entryHash);
    expect(verifyV5ProspectiveJournal(path)).toEqual([first, second]);
    const intact = readFileSync(path, 'utf8');
    writeFileSync(path, intact.replace('225000000', '225000001'));
    expect(() => verifyV5ProspectiveJournal(path)).toThrow('V5_JOURNAL_INVALID');
    expect(() => appendV5ProspectivePrediction(path, fixtureCandidate('2026-10-04', 3))).toThrow('V5_JOURNAL_INVALID');
    writeFileSync(path, intact.slice(0, -1));
    expect(() => verifyV5ProspectiveJournal(path)).toThrow('V5_JOURNAL_INCOMPLETE');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('no V5 Ridge fit/evaluation; runtime stays pending and prospective journal is read-only verified', () => {
  const source = readFileSync(new URL('../experiments/hu06-demand-v5-preregistration.ts', import.meta.url), 'utf8') + readFileSync(new URL('../experiments/hu06-demand-v5-prospective.ts', import.meta.url), 'utf8');
  expect(source).not.toMatch(/\bfitRidge(?:V2)?\s*\(|\bevaluate\s*\(|\bforecastDirectDemand\s*\(/);
  for (let horizon = 1; horizon <= 6; horizon++) expect(loadDirectDemandV5Model(horizon)).toMatchObject({ horizonDays: horizon, state: 'pendingProspectiveValidation', academicValidation: 'pending' });
  expect(existsSync(new URL('../models/xm-demandasin-ridge-direct-h7-v5/1.0.0/model.json', import.meta.url))).toBe(false);
  const path = fileURLToPath(new URL('../../../docs/evidencias/hu-06-demand-v5-prospective/predictions.jsonl', import.meta.url));
  const before = existsSync(path) ? readFileSync(path, 'utf8') : null;
  const journal = verifyV5ProspectiveJournal(path);
  expect(new Set(journal.map(entry => `${entry.modelVersion}|${entry.forecastOriginDate}|${entry.targetDate}|${entry.horizonDays}`)).size).toBe(journal.length);
  expect(existsSync(path) ? readFileSync(path, 'utf8') : null).toBe(before);
});