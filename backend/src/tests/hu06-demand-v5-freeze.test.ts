import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { addDays, parseCsv } from '@/experiments/hu06-multihorizon';
import { buildV5Features, v5OrderedFeatures } from '@/experiments/hu06-demand-v5-preregistration';
import { freezeV5Horizon, predictV5Frozen, v5TrainingSamples } from '@/experiments/hu06-demand-v5-training';
import { demandEligibilityIndex } from '@/services/demand-semantic-eligibility';

const root = new URL('../../../', import.meta.url);
const preregistration = JSON.parse(readFileSync(new URL('docs/evidencias/hu-06-demand-v5-preregistration/manifest.json', root), 'utf8'));
const corpus = readFileSync(new URL(preregistration.corpus.file, root));
const records = parseCsv(corpus.toString('utf8'));
const adjustment = records.filter(row => row.fecha_xm <= preregistration.partitions.validation.end);
const folder = new URL('docs/evidencias/hu-06-demand-v5-frozen-models/', root);
const report = JSON.parse(readFileSync(new URL('validation-report.json', folder), 'utf8'));
const dryRun = JSON.parse(readFileSync(new URL('dry-run.json', folder), 'utf8'));
const model = (horizon: number) => JSON.parse(readFileSync(new URL(`h${horizon}.json`, folder), 'utf8'));

test('tagged preregistration and byte-identical corpus are untouched', () => {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const tagCommit = git('rev-parse', 'hu06-v5-preregistered^{commit}');
  expect(git('merge-base', tagCommit, 'HEAD')).toBe(tagCommit);
  expect(report.preregistrationTag).toBe('hu06-v5-preregistered');
  expect(report.preregistrationCommit).toBe(tagCommit);
  for (const name of ['manifest.json', 'README.md', 'protocol.md']) {
    const path = `docs/evidencias/hu-06-demand-v5-preregistration/${name}`;
    expect(readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n').trimEnd()).toBe(git('show', `hu06-v5-preregistered:${path}`).replace(/\r\n/g, '\n').trimEnd());
  }
  expect(createHash('sha256').update(corpus).digest('hex')).toBe('18fd5aad3fe12eaa5290dba9ea551ccaef1a2baf4f41febf0c0354f0252c1735');
  expect(report.partitionsUsed).toEqual({ train: preregistration.partitions.train, validation: preregistration.partitions.validation });
  expect(report.retrospectiveEvaluationUsed).toBe(false);
});

test.each([1, 2, 3, 4, 5, 6])('V5 h%s frozen coefficients/scaler/alpha and baselines reproduce TRAIN+VALIDATION only', horizon => {
  const frozen = model(horizon), selected = freezeV5Horizon(adjustment, preregistration, horizon);
  const row = report.horizons.find((value: { horizonDays: number }) => value.horizonDays === horizon)!;
  expect(frozen).toMatchObject({ horizonDays: horizon, modelId: `xm-demandasin-ridge-direct-h${horizon}-v5`, modelVersion: 'hu06-demand-v5-c-primary@1.0.0',
    preregistrationCutoff: preregistration.preregistrationCutoff, state: 'pendingProspectiveValidation', academicValidation: 'pending', corpusHash: preregistration.corpus.sha256,
    trainingRange: preregistration.partitions.train, validationRange: preregistration.partitions.validation, statusOfPromotion: 'not_evaluated_prospectively' });
  expect(frozen.orderedFeatures).toEqual(v5OrderedFeatures);
  expect(frozen.orderedFeatures).toHaveLength(16);
  expect(frozen.samples).toEqual({ train: 787, validation: 61 });
  expect(frozen.coefficients).toEqual(selected.fittedParameters.coefficients);
  expect(frozen.scaler).toEqual({ ddof: 0, means: selected.fittedParameters.means, standardDeviations: selected.fittedParameters.standardDeviations });
  expect(frozen.intercept).toBe(selected.fittedParameters.intercept);
  expect(frozen.selectedAlpha).toBe(selected.selectedAlpha);
  expect(frozen.baselineReference).toBe(selected.baselineReference);
  expect(frozen.validationMetrics).toEqual(selected.validationMetrics);
  expect(row.alpha).toBe([...row.alphaValidationGrid].sort((left, right) => left.metrics.MAE - right.metrics.MAE || left.metrics.RMSE - right.metrics.RMSE || left.alpha - right.alpha)[0].alpha);
  expect(row.baselineReference).toBe([...row.baselineValidationGrid].sort((left, right) => left.metrics.MAE - right.metrics.MAE || left.metrics.RMSE - right.metrics.RMSE || left.id.localeCompare(right.id))[0].id);
  expect(row.unavailable).toBe(0);
  const rows = v5TrainingSamples(adjustment, preregistration.partitions.train, horizon);
  for (const index of [0, rows.length - 1]) expect(frozen.scaler.means[index % 16]).toBe(rows.reduce((total, item) => total + item.features[index % 16]!, 0) / rows.length);
});

test('horizon features are target-blind, semantic USABLE and sourced within 42 days', () => {
  const eligibility = demandEligibilityIndex(adjustment.map(row => ({ date: row.fecha_xm, value: row.demanda_kwh })));
  const frozen = model(6);
  for (const item of [...frozen.trainingSourceProvenance, ...frozen.validationSourceProvenance]) {
    expect(item.count).toBe(28);
    expect(item.actualSourceDates).toHaveLength(28);
    expect(item.oldestDate).toBe(item.actualSourceDates[0]);
    expect(item.newestDate).toBe(item.actualSourceDates.at(-1));
    expect(item.calendarSpanDays).toBeLessThanOrEqual(42);
    expect(item.featureSourceDates.every((date: string) => date <= item.forecastOriginDate && eligibility.get(date)?.semanticStatus === 'USABLE')).toBe(true);
  }
  const historical = buildV5Features(records, '2026-09-27', '2026-10-03', 6)!;
  const changed = buildV5Features([...records, { fecha_xm: '2026-10-03', demanda_kwh: Number.MAX_VALUE }], '2026-09-27', '2026-10-03', 6)!;
  expect(changed.values).toEqual(historical.values);
  expect(buildV5Features(records.filter(row => row.fecha_xm !== '2026-09-21'), '2026-09-27', '2026-10-03', 6)).toBeNull();
  expect(() => buildV5Features(records, '2026-09-27', '2026-10-04', 7)).toThrow();
});

test('h5/h6 dry-runs are deterministic and never prospective journal entries', () => {
  expect(dryRun.status).toBe('NOT_PROSPECTIVE_EVIDENCE');
  expect(dryRun.predictions).toHaveLength(2);
  for (const item of dryRun.predictions) {
    expect([5, 6]).toContain(item.horizonDays);
    expect(item.targetDate).toBe(addDays('2026-09-27', item.horizonDays));
    expect(item).toMatchObject({ forecastOriginDate: '2026-09-27', vectorFinite: true, predictionCalculable: true, isProspectivePrediction: false, count: 28, calendarSpanDays: 29 });
    const features = buildV5Features(records.filter(row => row.fecha_xm <= '2026-09-27'), '2026-09-27', item.targetDate, item.horizonDays)!;
    expect(features.featureDates).toEqual(item.featureSourceDates);
    const frozen = model(item.horizonDays);
    expect(predictV5Frozen({ alpha: frozen.selectedAlpha, coefficients: frozen.coefficients, intercept: frozen.intercept, means: frozen.scaler.means, standardDeviations: frozen.scaler.standardDeviations }, features.values)).toBe(item.prediction.demanda_kwh);
  }
  expect(existsSync(new URL('docs/evidencias/hu-06-demand-v5-prospective/predictions.jsonl', root))).toBe(false);
});

test('no h7, runtime artifacts, retrospective selection or preregistration edits', () => {
  expect(existsSync(new URL('h7.json', folder))).toBe(false);
  for (let horizon = 1; horizon <= 7; horizon++) expect(existsSync(new URL(`backend/src/models/xm-demandasin-ridge-direct-h${horizon}-v5/1.0.0/model.json`, root))).toBe(false);
  const script = readFileSync(new URL('backend/scripts/hu06-demand-v5-freeze.ts', root), 'utf8');
  expect(script).toContain('records.filter(record => record.fecha_xm <= manifest.partitions.validation.end)');
  expect(script).not.toContain('experimentDemandV4(');
  expect(report.retrospectiveEvaluationUsed).toBe(false);
});