import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addDays, parseCsv, sha256, type FrozenV4Model } from '@/experiments/hu08-price-v4-preregistration';
import { appendFrozenPrediction, assessOrigin, freezeCycle, parseAndVerifyRegistry, type SourceCoverage } from '@/experiments/hu08-price-v4-prospective';

const root = new URL('../../../docs/evidencias/hu-08-price-v4-preregistration/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8')) as { preregistrationCutoff: string; frozenModels: Record<string, FrozenV4Model> };
const cutoff = manifest.preregistrationCutoff;
const coverage: SourceCoverage = {
  priceUntil: '2026-10-01', geneUntil: '2026-10-01', priceFetchedAt: '2026-10-02T15:00:00.000Z', geneFetchedAt: '2026-10-02T15:00:01.000Z',
  priceWindowId: 201, geneWindowId: 202, priceConsolidatedId: 203, geneConsolidatedId: 204, priceContentHash: 'p'.repeat(64), geneContentHash: 'g'.repeat(64),
  priceEnergyDatasetId: 205, geneEnergyDatasetId: 206, priceWindowHash: 'a'.repeat(64), geneWindowHash: 'b'.repeat(64)
};
const now = new Date('2026-10-02T17:00:00.000Z');
const original = parseCsv(readFileSync(new URL('corpus/price-gene-adjustment-2024-01-01_2026-05-31.csv', root), 'utf8'));
const records = original.filter(row => row.fecha_xm >= '2026-05-17').map(row => ({ ...row, fecha_xm: addDays(row.fecha_xm, 123) }));

test('frozen models on disk match preregistration manifest without changes', () => {
  for (let horizon = 1; horizon <= 7; horizon++) {
    const text = readFileSync(new URL(`frozen-models/h${horizon}.json`, root), 'utf8');
    expect(JSON.parse(text)).toEqual(manifest.frozenModels[String(horizon)]);
    expect(sha256(text)).toMatch(/^[a-f0-9]{64}$/);
  }
});

test('origin needs aligned complete sources, post-cutoff acquisition and closed post-cutoff day', () => {
  const ready = { cutoff, now, coverage, priceComplete: true, geneComplete: true };
  expect(assessOrigin(ready)).toMatchObject({ status: 'ready', origin: '2026-10-01' });
  expect(assessOrigin({ ...ready, geneComplete: false })).toMatchObject({ reason: 'SOURCE_INCOMPLETE_24_PERIODS' });
  expect(assessOrigin({ ...ready, coverage: { ...coverage, priceFetchedAt: cutoff } })).toMatchObject({ reason: 'SOURCE_NOT_FETCHED_AFTER_PREREGISTRATION' });
  expect(assessOrigin({ ...ready, coverage: { ...coverage, priceUntil: '2026-09-28', geneUntil: '2026-09-28' } })).toMatchObject({ reason: 'ORIGIN_BEFORE_PREREGISTRATION' });
  expect(assessOrigin({ ...ready, coverage: { ...coverage, geneUntil: '2026-09-30' } })).toMatchObject({ reason: 'SOURCE_COVERAGE_NOT_ALIGNED' });
  expect(assessOrigin({ ...ready, now: new Date('2026-10-02T04:00:00.000Z'), coverage: { ...coverage, priceFetchedAt: '2026-10-01T17:00:00.000Z', geneFetchedAt: '2026-10-01T17:00:01.000Z' } })).toMatchObject({ reason: 'ORIGIN_DAY_NOT_CLOSED' });
});

test('future target is frozen once with identity and provenance; repeat cannot rewrite it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'v4-prospective-')), registryPath = join(directory, 'predictions.jsonl');
  const args = { cutoff, now, coverage, priceComplete: true, geneComplete: true, latestKnownPriceDate: '2026-10-01', records, models: [manifest.frozenModels['2']!], commit: '414a7c5', tag: 'hu08-v4-preregistered', registryPath };
  try {
    const first = freezeCycle(args); expect(first.appended).toHaveLength(1);
    const entry = first.appended[0]!;
    expect(entry).toMatchObject({ forecastOriginDate: '2026-10-01', targetDate: '2026-10-03', horizonDays: 2, preregistrationCommit: '414a7c5', preregistrationTag: 'hu08-v4-preregistered', sourceIds: { priceWindowId: 201 } });
    expect(entry.prediction).toHaveLength(24); expect(entry.previousEntryHash).toBeNull();
    const snapshot = readFileSync(registryPath, 'utf8');
    expect(freezeCycle(args).unavailable).toEqual([{ horizonDays: 2, targetDate: '2026-10-03', reason: 'DUPLICATE_PROSPECTIVE_PREDICTION' }]);
    expect(readFileSync(registryPath, 'utf8')).toBe(snapshot);
    expect(parseAndVerifyRegistry(registryPath)).toEqual([entry]);
    expect(freezeCycle({ ...args, latestKnownPriceDate: '2026-10-03' }).unavailable[0]?.reason).toBe('TARGET_ALREADY_KNOWN_OR_NOT_FUTURE');
    expect(readFileSync(registryPath, 'utf8')).toBe(snapshot);
    writeFileSync(registryPath, snapshot.replace('414a7c5', '414a7c6'));
    expect(() => parseAndVerifyRegistry(registryPath)).toThrow('PROSPECTIVE_CHAIN_INVALID');
    expect(() => freezeCycle(args)).toThrow('PROSPECTIVE_CHAIN_INVALID');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('partial JSONL fails closed and target values supplied in feature records cannot freeze', () => {
  const directory = mkdtempSync(join(tmpdir(), 'v4-prospective-')), registryPath = join(directory, 'predictions.jsonl');
  try {
    writeFileSync(registryPath, '{"partial":true}');
    expect(() => parseAndVerifyRegistry(registryPath)).toThrow('PROSPECTIVE_CHAIN_INCOMPLETE');
    expect(() => appendFrozenPrediction(registryPath, {} as never)).toThrow('PROSPECTIVE_CHAIN_INCOMPLETE');
    rmSync(registryPath);
    const target = records.slice(0, 24).map(row => ({ ...row, fecha_xm: '2026-10-03' }));
    const args = { cutoff, now, coverage, priceComplete: true, geneComplete: true, latestKnownPriceDate: '2026-10-01', records: [...records, ...target], models: [manifest.frozenModels['2']!], commit: '414a7c5', tag: 'hu08-v4-preregistered', registryPath };
    expect(() => freezeCycle(args)).toThrow('Prospective target must be unavailable');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('multiple horizons link their hashes; unavailable does not create a registry', () => {
  const directory = mkdtempSync(join(tmpdir(), 'v4-prospective-')), registryPath = join(directory, 'predictions.jsonl');
  const args = { cutoff, now, coverage, priceComplete: true, geneComplete: true, latestKnownPriceDate: '2026-10-01', records, models: [manifest.frozenModels['2']!, manifest.frozenModels['3']!], commit: '414a7c5', tag: 'hu08-v4-preregistered', registryPath };
  try {
    expect(freezeCycle({ ...args, coverage: { ...coverage, priceFetchedAt: cutoff } }).appended).toHaveLength(0);
    expect(() => readFileSync(registryPath)).toThrow();
    const result = freezeCycle(args);
    expect(result.appended).toHaveLength(2);
    expect(result.appended[1]!.previousEntryHash).toBe(result.appended[0]!.entryHash);
    expect(parseAndVerifyRegistry(registryPath)).toEqual(result.appended);
    const snapshot = readFileSync(registryPath, 'utf8');
    expect(freezeCycle(args).appended).toHaveLength(0);
    expect(readFileSync(registryPath, 'utf8')).toBe(snapshot);
    writeFileSync(registryPath, `${snapshot}\n`);
    expect(() => parseAndVerifyRegistry(registryPath)).toThrow();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});