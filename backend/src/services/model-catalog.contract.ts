// Contract for Predictive Artifact Catalog API.
// Represents both ML models and deterministic rules without breaking their internal loaders.

export type PredictiveArtifactKind = 'model' | 'rule';

/** Minimal summary returned by GET /models (no coefficients). */
export interface PredictiveArtifactSummary {
  id: string;
  version: string;
  kind: PredictiveArtifactKind;
  type: string;
  target: string;
  unit: string;
  forecastType: string;
  activeInRuntime: boolean;
}

/** Full technical metadata returned by GET /models/:id. */
export interface PredictiveArtifactMetadata {
  id: string;
  version: string;
  kind: PredictiveArtifactKind;
  type: string;
  target: string;
  unit: string;
  forecastType: string;
  horizon: { value: number; unit: 'periods' | 'days' };
  data: {
    source: string;
    profile?: string;
    ruleset?: string;
    trainingRange?: { start: string; end: string };
    effectiveTrainingRange?: { start: string; end: string };
    externalHoldoutRange?: { start: string; end: string };
  };
  method: {
    equation: string;
    features: string[];
    parameters: Record<string, unknown>;
  };
  quality: {
    metricsAvailable: boolean;
    confidenceStatus?: string;
  };
  limitations: string[];
  lifecycle: {
    activeInRuntime: boolean;
    promoted: boolean;
    academicValidation: 'pending' | 'validated';
  };
}

/** Payload returned by GET /models/:id/metrics. */
export interface PredictiveArtifactMetrics {
  id: string;
  version: string;
  evaluationType?: string;
  range: { start: string; end: string };
  evaluable: number;
  unavailable: number;
  metrics: {
    MAE: { value: number; unit: string };
    RMSE: { value: number; unit: string };
    bias: { value: number; unit: string };
    WAPE?: { value: number; unit: string };
  };
}

/** Error returned when artifact not found. */
export interface PredictiveArtifactNotFoundError {
  error: 'PREDICTIVE_ARTIFACT_NOT_FOUND';
  message: string;
}
