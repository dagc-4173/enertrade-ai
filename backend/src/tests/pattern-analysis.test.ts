import { describe, expect, test } from 'bun:test';
import { analyzePreparedDataset } from '../services/pattern-analysis.service';

const gene = (records: unknown[]) => ({ profileId: 'xm_gene_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_gene_base', sourceRulesetVersion: '1.0.0', content: { records } });
const demand = (records: unknown[]) => ({ profileId: 'xm_demandasin_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_demandasin_base', sourceRulesetVersion: '1.0.0', content: { records } });
const price = (records: unknown[]) => ({ profileId: 'xm_preciobolsnaci_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_preciobolsnaci_base', sourceRulesetVersion: '1.0.0', content: { records } });

function pattern(result: ReturnType<typeof analyzePreparedDataset>, type: string) {
  const value = result.patterns.find(item => item.type === type);
  expect(value).toBeDefined();
  return value!;
}

describe('HU12 análisis estadístico determinista de patrones', () => {
  test('PATTERN-01: Gene válido produce trend, distribution y recurrencia horaria', () => {
    const result = analyzePreparedDataset(gene([
      { fecha_xm: '2024-01-01', hora_xm: 1, energia_kwh: 10 }, { fecha_xm: '2024-01-02', hora_xm: 1, energia_kwh: 20 },
      { fecha_xm: '2024-01-01', hora_xm: 2, energia_kwh: 30 }, { fecha_xm: '2024-01-02', hora_xm: 2, energia_kwh: 40 },
    ]));
    expect(result.status).toBe('completed');
    expect(result.patterns.map(item => item.type)).toEqual(['distribution', 'trend', 'recurrence']);
    expect(pattern(result, 'recurrence').metrics).toMatchObject({ grouping: '1-24', periods: [{ key: '1', count: 2, mean: 15 }, { key: '2', count: 2, mean: 35 }] });
  });

  test('PATTERN-02: DemaSIN agrupa recurrencia Monday-Sunday', () => {
    const result = analyzePreparedDataset(demand([
      { fecha_xm: '2024-01-01', demanda_kwh: 10 }, { fecha_xm: '2024-01-08', demanda_kwh: 20 },
    ]));
    expect(pattern(result, 'recurrence').metrics).toMatchObject({ grouping: 'Monday-Sunday', periods: [{ key: 'Monday', count: 2, mean: 15 }] });
  });

  test('PATTERN-03: precio conserva recurrencia por período', () => {
    const result = analyzePreparedDataset(price([
      { fecha_xm: '2024-01-01', periodo: 24, precio_cop_kwh: 100.25 }, { fecha_xm: '2024-01-02', periodo: 24, precio_cop_kwh: 101.75 },
    ]));
    expect(pattern(result, 'recurrence').metrics).toMatchObject({ periods: [{ key: '24', count: 2, mean: 101 }] });
  });

  test('PATTERN-04: muestra limitada es partial con advertencias', () => {
    const result = analyzePreparedDataset(demand([{ fecha_xm: '2024-01-01', demanda_kwh: 10 }]));
    expect(result.status).toBe('partial');
    expect(result.patterns.map(item => item.type)).toEqual(['distribution']);
    expect(result.warnings).toHaveLength(2);
  });

  test('PATTERN-05: dataset sin observaciones es no_results', () => {
    expect(analyzePreparedDataset(demand([]))).toMatchObject({ status: 'no_results', patterns: [], sampleSize: 0 });
  });

  test('PATTERN-06: perfil incompatible se rechaza', () => {
    expect(() => analyzePreparedDataset({ ...demand([]), profileId: 'other' })).toThrow('no es compatible');
  });

  test('PATTERN-07 y PATTERN-08: misma entrada es reproducible e inmutable', () => {
    const input = demand([{ fecha_xm: '2024-01-01', demanda_kwh: 0.1 }, { fecha_xm: '2024-01-08', demanda_kwh: 0.2 }]);
    const before = structuredClone(input);
    expect(analyzePreparedDataset(input)).toEqual(analyzePreparedDataset(input));
    expect(input).toEqual(before);
  });

  test('PATTERN-11 y PATTERN-12: distribución y texto son deterministas', () => {
    const result = analyzePreparedDataset(demand([{ fecha_xm: '2024-01-01', demanda_kwh: 0.1 }, { fecha_xm: '2024-01-08', demanda_kwh: 0.2 }]));
    expect(pattern(result, 'distribution').metrics).toMatchObject({ count: 2, mean: 0.15000000000000002, median: 0.15000000000000002, standardDeviation: expect.any(Number) });
    expect(pattern(result, 'trend').description).toBe('Tendencia increasing con pendiente 0.1 por observación ordenada.');
  });
});