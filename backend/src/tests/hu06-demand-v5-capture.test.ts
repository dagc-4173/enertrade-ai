import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { addDays } from '@/experiments/hu06-multihorizon';
import { buildV5Features } from '@/experiments/hu06-demand-v5-preregistration';
import { assertV5ScoringAcquisition, findLatestV5ClosedOrigin, resolveV5SourceAcquisitions, v5TargetGate, type V5SourceWindow } from '@/experiments/hu06-demand-v5-capture-gates';
import { prepareV5ProspectivePrediction, v5PreregistrationCutoff } from '@/experiments/hu06-demand-v5-prospective';

const generatedAt = '2026-10-06T23:59:00.000Z';
const origin = '2026-10-03';
const targetDate = '2026-10-07';
const records = Array.from({ length: 60 }, (_, index) => ({ fecha_xm: addDays(origin, index - 59), demanda_kwh: 220_000_000 + (index % 3) * 1_000_000 }));
const built = buildV5Features(records, origin, targetDate, 4)!;
const window = (fetchedAt: string | null): V5SourceWindow => ({ id: 1, status: 'completed', requestedFrom: new Date('2026-08-01T00:00:00Z'),
  requestedTo: new Date('2026-10-03T00:00:00Z'), fetchedAt: fetchedAt ? new Date(fetchedAt) : null, energyDatasetId: 20, contentHash: 'a'.repeat(64) });

test.each(['2026-10-01T18:00:00.000Z', '2026-10-02T12:00:00.000Z', generatedAt])('source fetched at %s is accepted regardless of cutoff when available before or at generation', fetchedAt => {
  const result = resolveV5SourceAcquisitions(built.featureDates, [window(fetchedAt)], generatedAt);
  expect(result.valid).toBe(true);
  expect(result.acquisitions.map(row => row.date)).toEqual([...new Set(built.featureDates)].sort());
  const prepared = prepareV5ProspectivePrediction({ records, origin, targetDate, horizonDays: 4,
    modelId: 'xm-demandasin-ridge-direct-h4-v5', modelVersion: 'hu06-demand-v5-c-primary@1.0.0', prediction: 225_000_000,
    generatedAt, targetUnknownAtCutoff: true, targetUnknownAtGeneration: true, sourceAcquisitions: result.acquisitions });
  expect(prepared.featureSourceDates).toEqual(result.acquisitions.map(row => row.date));
  expect(prepared.featureSnapshotHash).toMatch(/^[a-f0-9]{64}$/);
});

test('future acquisition, missing provenance and ambiguous windows are rejected', () => {
  expect(resolveV5SourceAcquisitions(built.featureDates, [window('2026-10-07T00:00:00.000Z')], generatedAt)).toMatchObject({ valid: false, reason: 'SOURCE_FETCHED_AFTER_GENERATION' });
  expect(resolveV5SourceAcquisitions(built.featureDates, [], generatedAt)).toMatchObject({ valid: false, reason: 'SOURCE_PROVENANCE_MISSING' });
  expect(resolveV5SourceAcquisitions(built.featureDates, [window(generatedAt), { ...window(generatedAt), id: 2 }], generatedAt)).toMatchObject({ valid: false, reason: 'SOURCE_PROVENANCE_AMBIGUOUS' });
});

test('source windows must be completed, timestamped and linked to dataset and hash', () => {
  for (const source of [{ ...window(generatedAt), status: 'pending' }, window(null), { ...window(generatedAt), energyDatasetId: null }, { ...window(generatedAt), contentHash: null }]) {
    expect(resolveV5SourceAcquisitions(built.featureDates, [source], generatedAt)).toMatchObject({ valid: false, reason: 'SOURCE_PROVENANCE_INVALID' });
  }
});

test('target acquired in a window or persisted in coverage is rejected even if its date is future', () => {
  const input = { targetDate, now: new Date(generatedAt), latestReceivedDate: '2026-10-04', acquiredAt: null, cutoff: v5PreregistrationCutoff };
  expect(v5TargetGate(input)).toEqual({ targetKnown: false, targetFuture: true, reason: null });
  expect(v5TargetGate({ ...input, acquiredAt: new Date('2026-10-06T23:00:00.000Z') })).toMatchObject({ targetKnown: true, reason: 'TARGET_ALREADY_RECEIVED' });
  expect(v5TargetGate({ ...input, acquiredAt: new Date('2026-10-01T18:00:00.000Z') })).toMatchObject({ targetKnown: true, reason: 'TARGET_KNOWN_AT_CUTOFF' });
  expect(v5TargetGate({ ...input, latestReceivedDate: '2026-10-07' })).toMatchObject({ targetKnown: true, reason: 'TARGET_ALREADY_RECEIVED' });
});

test('nonfuture target uses Colombia calendar date and is rejected before prediction', () => {
  const input = { targetDate: '2026-10-06', now: new Date(generatedAt), latestReceivedDate: '2026-10-04', acquiredAt: null, cutoff: v5PreregistrationCutoff };
  expect(v5TargetGate(input)).toEqual({ targetKnown: false, targetFuture: false, reason: 'TARGET_NOT_FUTURE' });
  expect(v5TargetGate({ ...input, targetDate: '2026-10-07', now: new Date('2026-10-07T02:00:00.000Z') })).toMatchObject({ targetFuture: true });
});

test('prospective scoring requires target acquisition strictly after cutoff and generation; no metrics are calculated', () => {
  const entry = { targetDate, generatedAt, preregistrationCutoff: v5PreregistrationCutoff };
  for (const fetchedAt of ['2026-10-01T18:00:00.000Z', v5PreregistrationCutoff, '2026-10-02T00:00:00.000Z', generatedAt]) {
    expect(() => assertV5ScoringAcquisition(entry, { targetDate, fetchedAt })).toThrow('V5_TARGET_ACQUISITION_NOT_PROSPECTIVE');
  }
  expect(assertV5ScoringAcquisition(entry, { targetDate, fetchedAt: '2026-10-08T12:00:00.000Z' })).toBe(true);
  expect(() => assertV5ScoringAcquisition(entry, { targetDate: '2026-10-08', fetchedAt: '2026-10-09T00:00:00.000Z' })).toThrow();
});

test('latest origin is selected from closed semantically eligible days; no open-day or silent imputation', () => {
  expect(findLatestV5ClosedOrigin(records, new Date(generatedAt))).toBe(origin);
  const withOpenDay = [...records, { fecha_xm: '2026-10-06', demanda_kwh: 221_000_000 }];
  expect(findLatestV5ClosedOrigin(withOpenDay, new Date(generatedAt))).toBe(origin);
  const excludedOrigin = records.map(row => row.fecha_xm === origin ? { ...row, demanda_kwh: 1 } : row);
  expect(findLatestV5ClosedOrigin(excludedOrigin, new Date(generatedAt))).toBe('2026-10-02');
});

test('CLI keeps large JSON buffer, gates before prediction and preflight exits before append', () => {
  const script = readFileSync(new URL('../../scripts/hu06-demand-v5-capture.ts', import.meta.url), 'utf8');
  expect(script).toContain('maxBuffer: 16 * 1024 * 1024');
  expect(script).toContain("argument === '--preflight'");
  expect(script).toContain('if (preflight || reason) { outcomes.push(outcome); continue; }');
  expect(script).not.toContain('row.fetchedAt <= preregistration.preregistrationCutoff');
  expect(script).toContain('resolveV5SourceAcquisitions(selected?.featureDates ?? [], windows, generatedAt)');
  expect(script).toContain('const acquiredAgain = await acquiredTarget(targetDate)');
  expect(script).toContain('verifyV5ProspectiveJournal(registryPath)');
});