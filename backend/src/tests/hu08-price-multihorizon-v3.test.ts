import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { exogenousSamples, experimentV3, fitRidge, parseCsv, predict, verifyAlignedCorpus, type Ablation } from '@/experiments/hu08-price-multihorizon-v3';
import { partitions } from '@/experiments/hu08-price-multihorizon';
import { createHash } from 'node:crypto';

const root = new URL('../../../docs/evidencias/hu-08-price-multihorizon-v3-exogenous/', import.meta.url), corpusText = readFileSync(new URL('corpus/xm-price-gene-demand-2024-01-01_2026-09-28.csv', root), 'utf8'), records = parseCsv(corpusText), corpus = verifyAlignedCorpus(records), stored = JSON.parse(readFileSync(new URL('results.json', root), 'utf8')) as any;
const hash = createHash('sha256').update(corpusText).digest('hex'), excluded = new Set(['2026-09-16', '2026-09-28']);

test('HU08-MH-V3 freezes aligned real sources with exact IDs, range and hash', () => {
  expect(hash).toBe('6a809594044cf8f608cf2e52bfbec6d1bb0ebe7268414c4ad1f6da8d9aceae6e'); expect(corpus).toMatchObject({ firstDate: '2024-01-01', lastDate: '2026-09-28', completeDays: 1002, observations: 24048, excludedDemandDates: ['2026-09-16','2026-09-28'] });
  expect(stored.corpus.sources).toMatchObject({ price: { consolidatedDatasetId: 12, energyDatasetId: 208 }, generation: { consolidatedDatasetId: 11, energyDatasetId: 206 }, demand: { consolidatedDatasetId: 9, energyDatasetId: 202 } });
});

test('HU08-MH-V3 preserves 24 periods and documented daily Gene aggregation', () => {
  for (const date of ['2024-01-01','2026-09-27','2026-09-28']) { const rows = records.filter(row => row.fecha_xm === date); expect(rows).toHaveLength(24); expect(new Set(rows.map(row => row.periodo)).size).toBe(24); const sum = rows.reduce((total, row) => total + row.generacion_kwh, 0); expect(rows.every(row => Math.abs(row.generacion_total_diaria_kwh - sum) <= 1e-6 * Math.max(1, Math.abs(sum)))).toBe(true); }
});

test.each([1, 7])('HU08-MH-V3 h%s uses only Gene/Demand dates at or before origin and excludes semantic review', horizonDays => {
  const built = exogenousSamples(records, partitions.externalHoldout, horizonDays); expect(built.rows.length).toBeGreaterThan(0);
  for (const row of built.rows) { expect(row.demandFeatureDates.every(date => date <= row.forecastOriginDate && !excluded.has(date))).toBe(true); expect(row.generationFeatureDates.every(date => date <= row.forecastOriginDate)).toBe(true); expect(row.targetDate).not.toBe(row.forecastOriginDate); }
  const losses = built.losses; expect(losses.expected).toBe(2880); expect(losses.eligible + losses.priceHistory + losses.geneMissing + losses.demandMissing + losses.demandSemanticDirect + losses.demandSemanticRolling + losses.invalidInteraction).toBe(losses.expected);
});

test('HU08-MH-V3 ablations preserve V1 price vector and isolate each source contribution', () => {
  const row = exogenousSamples(records, { start: '2026-06-01', end: '2026-06-01' }, 1).rows[0]!;
  expect(row.featureSets.A_PRICE_ONLY).toEqual(row.features); expect(row.featureSets.B_PRICE_DEMAND.length).toBe(row.features.length + 6); expect(row.featureSets.C_PRICE_GENERATION.length).toBe(row.features.length + 9); expect(row.featureSets.D_PRICE_DEMAND_GENERATION.length).toBe(row.features.length + 16);
  expect(row.demandFeatureDates.every(date => date <= row.forecastOriginDate)).toBe(true); expect(row.generationFeatureDates.every(date => date <= row.forecastOriginDate)).toBe(true);
});

test('HU08-MH-V3 scaler is TRAIN-only and alpha selection uses VALIDATION for every ablation', () => {
  const fresh = experimentV3(records, hash); expect(fresh.results).toEqual(stored.results);
  for (const result of Object.values(fresh.results) as any[]) for (const [ablation, value] of Object.entries(result.ablations) as [Ablation, any][]) { const ordered = [...value.validation.ridge].sort((left, right) => left.metrics.MAE - right.metrics.MAE || left.metrics.RMSE - right.metrics.RMSE || left.alpha - right.alpha); expect(value.validation.selectedAlpha).toBe(ordered[0].alpha); const train = exogenousSamples(records, partitions.train, result.horizonDays).rows, trainOnly = fitRidge(train, ablation, value.validation.selectedAlpha); expect(value.fittedParameters.means).toEqual(trainOnly.means); expect(value.fittedParameters.standardDeviations).toEqual(trainOnly.standardDeviations); expect(value.externalHoldout.ridge.unavailable).toBe(0); }
}, 90_000);

test('HU08-MH-V3 primary combined artifacts exist only for technical candidates and match offline', () => {
  expect(Object.values(stored.results).filter((result: any) => result.technicalCandidate).map((result: any) => result.horizonDays)).toEqual([4,5]);
  for (const result of Object.values(stored.results) as any[]) { expect(result.primaryAblation).toBe('D_PRICE_DEMAND_GENERATION'); const url = new URL(`../models/${result.modelId}/1.0.0/model.json`, import.meta.url); expect(existsSync(url)).toBe(result.technicalCandidate); if (!result.technicalCandidate) continue; const artifact = JSON.parse(readFileSync(url,'utf8')), row = exogenousSamples(records,{start:'2026-06-01',end:'2026-06-01'},result.horizonDays).rows[0]!, model={alpha:artifact.hyperparameters.alpha,coefficients:artifact.coefficients,intercept:artifact.intercept,means:artifact.scaler.means,standardDeviations:artifact.scaler.standardDeviations}; expect(predict(model,row.featureSets.D_PRICE_DEMAND_GENERATION)).toBeCloseTo(predict(result.fittedParameters,row.featureSets.D_PRICE_DEMAND_GENERATION),10); }
});

test('HU08-MH-V3 does not select a diagnostic ablation post hoc or integrate runtime', () => {
  for (const entry of Object.values(stored.comparisonV1V2V3) as any[]) if (entry.v1Candidate && entry.v3TechnicalCandidate) expect(entry.replaceV1).toBe(entry.v3.MAE < entry.v1.MAE);
  const catalog=readFileSync(new URL('../services/model-catalog.service.ts',import.meta.url),'utf8'),script=readFileSync(new URL('../../scripts/hu08-price-multihorizon-v3.ts',import.meta.url),'utf8');expect(catalog).not.toContain('xm-preciobolsnaci-ridge-direct-h4-v3');expect(script.indexOf('await prisma.$disconnect()')).toBeLessThan(script.indexOf('experimentV3(frozen'));
});