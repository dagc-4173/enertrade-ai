export const demandSemanticRule = {
  id: 'demandasin_severe_drop_vs_trailing_median_v1',
  reference: 'median_previous_valid_days',
  historicalWindowDays: 14,
  minimumHistoryDays: 7,
  minimumRatio: 0.2,
} as const;

export type DemandSemanticStatus = 'USABLE' | 'SEMANTIC_REVIEW_REQUIRED';
export type DemandObservationEligibility = {
  date: string;
  value: number;
  reference: number | null;
  ratio: number | null;
  semanticStatus: DemandSemanticStatus;
  issueCode: 'WARNING_SEMANTIC_ANOMALY' | null;
};

export type DemandEligibilityIndex = ReadonlyMap<string, DemandObservationEligibility>;

const previousDate = (value: string, days: number) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - days); return date.toISOString().slice(0, 10); };

export function demandD1FeatureDates(targetDate: string) {
  return { forecastOriginDate: previousDate(targetDate, 1), featureDates: [1, 7, 14, 28].map(lag => previousDate(targetDate, lag)) };
}

const median = (values: number[]) => {
  const ordered = [...values].sort((left, right) => left - right); const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2;
};

export function evaluateDemandObservationEligibility(observations: { date: string; value: number }[]): DemandObservationEligibility[] {
  return observations.map((observation, index) => {
    const history = observations.slice(Math.max(0, index - demandSemanticRule.historicalWindowDays), index);
    if (history.length < demandSemanticRule.minimumHistoryDays) return { ...observation, reference: null, ratio: null, semanticStatus: 'USABLE', issueCode: null };
    const reference = median(history.map(item => item.value));
    if (!(reference > 0)) return { ...observation, reference, ratio: null, semanticStatus: 'USABLE', issueCode: null };
    const ratio = observation.value / reference; const severe = ratio < demandSemanticRule.minimumRatio;
    return { ...observation, reference, ratio, semanticStatus: severe ? 'SEMANTIC_REVIEW_REQUIRED' : 'USABLE', issueCode: severe ? 'WARNING_SEMANTIC_ANOMALY' : null };
  });
}

export function demandEligibilityIndex(observations: { date: string; value: number }[]): DemandEligibilityIndex {
  return new Map(evaluateDemandObservationEligibility(observations).map(item => [item.date, item]));
}

export function isDemandForecastSampleEligible(input: { eligibility: DemandEligibilityIndex; forecastOriginDate: string; featureDates: readonly string[]; targetDate?: string; requireTarget?: boolean }) {
  const required = [input.forecastOriginDate, ...input.featureDates, ...(input.requireTarget && input.targetDate ? [input.targetDate] : [])];
  return required.every(date => input.eligibility.get(date)?.semanticStatus === 'USABLE');
}