import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adjustmentPartitions, appendProspectivePrediction, assertProspectiveObservation, createProspectivePrediction, featureRows, parseCsv, preregisterModels, preregistrationVersion, prospectiveEvidenceMinimum, sha256, verifyCorpus } from '@/experiments/hu08-price-v4-preregistration';

const root = new URL('../../../docs/evidencias/hu-08-price-v4-preregistration/', import.meta.url), corpusText = readFileSync(new URL('corpus/price-gene-adjustment-2024-01-01_2026-05-31.csv', root), 'utf8'), records = parseCsv(corpusText), corpus = verifyCorpus(records), manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8')) as any;

test('V4 adjustment corpus ends at VALIDATION and excludes the previously observed holdout', () => {
  expect(corpus).toMatchObject({ firstDate: '2024-01-01', lastDate: '2026-05-31', days: 882, observations: 21168 }); expect(sha256(corpusText)).toBe(manifest.adjustmentCorpus.sha256);
  expect(manifest.partitions).toEqual(adjustmentPartitions); expect(manifest.forbiddenRetrospectiveBlock).toMatchObject({ start: '2026-06-01', end: '2026-09-28' }); expect(manifest.state).toBe('pendingProspectiveValidation');
});

test.each([1, 7])('V4 h%s builds 24 rows with every source date <= origin and no target required', horizonDays => {
  const built = featureRows(records, '2026-06-01', horizonDays); expect(built.rows).toHaveLength(24); expect(built.rows.every(row => row.target === undefined && row.featureDates.every(date => date <= built.forecastOriginDate))).toBe(true);
  expect(new Set(built.rows.map(row => row.period)).size).toBe(24);
});

test('V4 freezes alpha/baseline/scaler from TRAIN and VALIDATION only', () => {
  const fresh = preregisterModels(records, sha256(corpusText)); expect(fresh.state).toBe('pendingProspectiveValidation'); expect(fresh.results).toEqual(manifest.frozenModels);
  for (const model of Object.values(fresh.results)) { expect(model.trainingRange).toEqual(adjustmentPartitions.train); expect(model.validationRange).toEqual(adjustmentPartitions.validation); expect([0.01,0.1,1,10,100]).toContain(model.selectedAlpha); expect(['B1_ORIGIN','B7','HISTORICAL_MEAN']).toContain(model.baselineReference); expect(model.state).toBe('pendingProspectiveValidation'); }
}, 90_000);

test('prospective prediction is target-blind, reproducibly hashed and contains 24 immutable values', () => {
  const model = manifest.frozenModels['1'], input = { records, model, targetDate: '2026-06-01', preregistrationCutoff: manifest.preregistrationCutoff, sourceCoverage: { priceUntil: '2026-05-31', geneUntil: '2026-05-31', priceFetchedAt: manifest.preregistrationCutoff, geneFetchedAt: manifest.preregistrationCutoff }, generatedAt: new Date(Date.parse(manifest.preregistrationCutoff) + 1000).toISOString() };
  const first = createProspectivePrediction(input), second = createProspectivePrediction(input); expect(first.prediction).toHaveLength(24); expect(first.featureSnapshotHash).toBe(second.featureSnapshotHash); expect(first.forecastOriginDate).toBe('2026-05-31'); expect(first.targetDate).toBe('2026-06-01');
});

test('append-only registry rejects duplicate prediction and chains hashes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'enertrade-v4-')), path = join(directory, 'predictions.jsonl'), cutoff = manifest.preregistrationCutoff, model1 = manifest.frozenModels['1'], model2 = manifest.frozenModels['2'], coverage = { priceUntil: '2026-05-31', geneUntil: '2026-05-31', priceFetchedAt: cutoff, geneFetchedAt: cutoff }, generatedAt = new Date(Date.parse(cutoff) + 1000).toISOString();
  try { const input1 = createProspectivePrediction({ records, model: model1, targetDate: '2026-06-01', preregistrationCutoff: cutoff, sourceCoverage: coverage, generatedAt }), first = appendProspectivePrediction(path, input1); expect(first.previousEntryHash).toBeNull(); expect(() => appendProspectivePrediction(path, input1)).toThrow('immutable'); const input2 = createProspectivePrediction({ records, model: model2, targetDate: '2026-06-01', preregistrationCutoff: cutoff, sourceCoverage: coverage, generatedAt }), second = appendProspectivePrediction(path, input2); expect(second.previousEntryHash).toBe(first.entryHash); expect(readFileSync(path, 'utf8').trim().split('\n')).toHaveLength(2); } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('observed target must arrive after frozen prediction and preregistration cutoff', () => {
  const cutoff = manifest.preregistrationCutoff, generatedAt = new Date(Date.parse(cutoff) + 1000).toISOString();
  const prediction = createProspectivePrediction({ records, model: manifest.frozenModels['1'], targetDate: '2026-06-01', preregistrationCutoff: cutoff, sourceCoverage: { priceUntil: '2026-05-31', geneUntil: '2026-05-31', priceFetchedAt: cutoff, geneFetchedAt: cutoff }, generatedAt });
  const frozen = { ...prediction, previousEntryHash: null, entryHash: sha256(JSON.stringify(prediction)) }; expect(assertProspectiveObservation(frozen, { targetDate: '2026-06-01', fetchedAt: new Date(Date.parse(generatedAt) + 1000).toISOString(), values: Array(24).fill(100) })).toBe(true); expect(() => assertProspectiveObservation(frozen, { targetDate: '2026-06-01', fetchedAt: generatedAt, values: Array(24).fill(100) })).toThrow();
});

test('prospective evidence thresholds and preregistration identity are frozen', () => {
  expect(preregistrationVersion).toBe('hu08-price-v4-gene-only@1.0.0-preregistered'); expect(prospectiveEvidenceMinimum).toEqual({ preliminaryCompleteTargetDays: 14, sufficientCompleteTargetDaysPerHorizon: 60, periodsPerTargetDay: 24, rationale: expect.any(String) });
  const catalog = readFileSync(new URL('../services/model-catalog.service.ts', import.meta.url), 'utf8'); expect(catalog).not.toContain('v4-gene-only');
});