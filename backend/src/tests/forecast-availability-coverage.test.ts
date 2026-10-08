import { expect, test } from 'bun:test';
import { availabilityCoverageSql, createAvailabilityCoverageReader, type CoverageProjection } from '@/services/forecast-availability-coverage';
import { coverageFromConsolidated } from '@/services/xm-coverage.service';

function projection(overrides: Partial<CoverageProjection> = {}): CoverageProjection {
  return { historicalFrom: '2024-01-01', latestReceivedDate: '2026-10-03',
    invalidContent: false, invalidDate: false, observations: null, ...overrides };
}

test.each(['Gene', 'PrecBolsNaci'] as const)('%s coverage receives one metadata row and no consolidated content', async metric => {
  const calls: { sql: string; metric: string; rows: number }[] = [];
  const reader = createAvailabilityCoverageReader(async (sql, input) => {
    calls.push({ sql, metric: input, rows: 1 });
    return [projection()];
  });
  expect(await reader(metric)).toEqual({ historicalFrom: '2024-01-01', persistedUntil: '2026-10-03',
    latestReceivedDate: '2026-10-03', latestIndividuallyUsableDate: '2026-10-03', semanticExcludedDates: [] });
  expect(calls).toEqual([{ sql: availabilityCoverageSql, metric, rows: 1 }]);
  expect(availabilityCoverageSql).toContain('min(day)');
  expect(availabilityCoverageSql).toContain('max(day)');
  expect(availabilityCoverageSql).toContain("ELSE NULL END AS observations");
});

test('V5 projected distinct daily values preserve original semantic coverage without overlapping artifacts', async () => {
  const observations = Array.from({ length: 70 }, (_, index) => ({
    fecha_xm: new Date(Date.UTC(2026, 7, index + 1)).toISOString().slice(0, 10),
    demanda_kwh: index === 68 ? 1 : 220_000_000,
  }));
  const original = coverageFromConsolidated('DemaSIN', [1, 2, 3].map(() => ({ energyDataset: { content: { records: observations } } })));
  let queries = 0;
  const reader = createAvailabilityCoverageReader(async () => {
    queries++;
    return [projection({ observations })];
  });
  expect(await reader('DemaSIN')).toEqual(original);
  expect(queries).toBe(1);
  expect(availabilityCoverageSql).toContain('SELECT DISTINCT');
  expect(availabilityCoverageSql).toContain("key IN ('fecha_xm', 'demanda_kwh')");
});

test('empty projection is missing coverage; malformed projections and conflicting demand remain explicit failures', async () => {
  expect(await createAvailabilityCoverageReader(async () => [projection({ historicalFrom: null, latestReceivedDate: null })])('Gene')).toBeNull();
  for (const rows of [[], [projection({ invalidContent: true })], [projection({ invalidDate: true })]]) {
    await expect(createAvailabilityCoverageReader(async () => rows)('Gene')).rejects.toThrow('consolidated coverage projection');
  }
  await expect(createAvailabilityCoverageReader(async () => [projection({ observations: [
    { fecha_xm: '2026-10-03', demanda_kwh: 2 }, { fecha_xm: '2026-10-03', demanda_kwh: 3 },
  ] })])('DemaSIN')).rejects.toMatchObject({ code: 'XM_COVERAGE_CONFLICT' });
});
