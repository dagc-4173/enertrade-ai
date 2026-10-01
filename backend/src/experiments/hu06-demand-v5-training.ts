import { addDays, evaluate, predict, type DemandRecord, type Metrics, type Ridge, type Sample } from './hu06-multihorizon';
import { buildV5Features, v5OrderedFeatures } from './hu06-demand-v5-preregistration';
import { fitV4Ablation, v4Baselines, type V4Sample } from './hu06-demand-v4-experiment';
import { demandEligibilityIndex, isDemandForecastSampleEligible } from '@/services/demand-semantic-eligibility';

type Range = { start: string; end: string };
export type V5TrainingSample = V4Sample & { actualSourceDates: string[]; oldestDate: string; newestDate: string; count: 28; calendarSpanDays: number };
export type V5TrainingProtocol = { partitions: { train: Range; validation: Range }; selection: { alphaGrid: number[]; baselines: string[] } };

export function v5TrainingSamples(records: DemandRecord[], range: Range, horizonDays: number): V5TrainingSample[] {
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 6) throw new Error('V5_HORIZON_UNSUPPORTED');
  const observations = records.filter(row => row.fecha_xm <= range.end);
  const eligibility = demandEligibilityIndex(observations.map(row => ({ date: row.fecha_xm, value: row.demanda_kwh })));
  const samples: V5TrainingSample[] = [];
  for (let targetDate = range.start; targetDate <= range.end; targetDate = addDays(targetDate, 1)) {
    const origin = addDays(targetDate, -horizonDays);
    const built = buildV5Features(observations, origin, targetDate, horizonDays);
    if (!built || !isDemandForecastSampleEligible({ eligibility, forecastOriginDate: origin, featureDates: built.featureDates, targetDate, requireTarget: true })) continue;
    const target = eligibility.get(targetDate)?.value;
    if (target === undefined || built.featureDates.some(date => date > origin)) throw new Error('V5_TRAINING_LEAKAGE');
    samples.push({ forecastOriginDate: origin, targetDate, horizonDays, target, features: built.values, featureDates: built.featureDates,
      usedObservationDates: built.featureDates, usableStatisticDates: built.usableStatisticDates, actualSourceDates: built.actualSourceDates,
      oldestDate: built.oldestDate, newestDate: built.newestDate, count: built.count, calendarSpanDays: built.calendarSpanDays });
  }
  return samples;
}

export function freezeV5Horizon(records: DemandRecord[], protocol: V5TrainingProtocol, horizonDays: number) {
  if (JSON.stringify(protocol.selection.alphaGrid) !== JSON.stringify([0.01, 0.1, 1, 10, 100])) throw new Error('V5_ALPHA_GRID_CHANGED');
  const train = v5TrainingSamples(records, protocol.partitions.train, horizonDays);
  const validation = v5TrainingSamples(records, protocol.partitions.validation, horizonDays);
  if (train.length < 2 || validation.length === 0 || train.some(row => row.features.length !== v5OrderedFeatures.length) || validation.some(row => row.features.length !== v5OrderedFeatures.length)) throw new Error('V5_TRAIN_VALIDATION_INSUFFICIENT');
  const baselineFns = v4Baselines(train, 'C', protocol.selection.baselines);
  const baselineGrid = Object.entries(baselineFns).map(([id, calculation]) => ({ id, metrics: evaluate(validation, calculation) }));
  const baseline = [...baselineGrid].sort((left, right) => left.metrics.MAE - right.metrics.MAE || left.metrics.RMSE - right.metrics.RMSE || left.id.localeCompare(right.id))[0]!;
  const alphaGrid = protocol.selection.alphaGrid.map(alpha => {
    const model = fitV4Ablation(train, alpha);
    return { alpha, model, metrics: evaluate(validation, row => predict(model, row.features)) };
  });
  const selected = [...alphaGrid].sort((left, right) => left.metrics.MAE - right.metrics.MAE || left.metrics.RMSE - right.metrics.RMSE || left.alpha - right.alpha)[0]!;
  if (![...selected.model.coefficients, ...selected.model.means, ...selected.model.standardDeviations, selected.model.intercept, selected.metrics.MAE, selected.metrics.RMSE, selected.metrics.bias, selected.metrics.WAPE].every(Number.isFinite)) throw new Error('V5_NONFINITE_FROZEN_MODEL');
  return { horizonDays, train, validation, baselineReference: baseline.id, baselineValidation: baseline.metrics,
    baselineValidationGrid: baselineGrid, alphaValidationGrid: alphaGrid.map(row => ({ alpha: row.alpha, metrics: row.metrics })),
    selectedAlpha: selected.alpha, fittedParameters: selected.model, validationMetrics: selected.metrics };
}

export function predictV5Frozen(model: Ridge, features: number[]): number {
  if (features.length !== v5OrderedFeatures.length || model.coefficients.length !== features.length) throw new Error('V5_FEATURE_DIMENSION_MISMATCH');
  const value = predict(model, features);
  if (!Number.isFinite(value)) throw new Error('V5_NONFINITE_PREDICTION');
  return value;
}