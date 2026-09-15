import {loadModel} from '@/models/xm-demandasin-ridge/model-loader';

// Projection of the validated active artifact; no new evaluation is performed.
export function getDemandForecastMetrics() {
 const m=loadModel(), e=m.evaluationSummary, r=e.metrics.Ridge;
 return {status:'available',modelId:m.modelId,modelVersion:m.modelVersion,active:true,
  forecastType:m.forecastType,target:m.target,unit:m.unit,horizonDays:m.horizonDays,
  training:{trainedAt:m.trainedAt,trainedAtStatus:m.trainedAtStatus,snapshotSha256:m.trainingSnapshotSha256,
   sourceRange:m.trainingSourceRange,effectiveRange:m.effectiveTrainingRange,effectiveRows:m.effectiveTrainingRows},
  evaluation:{type:e.type,range:e.range,snapshotSha256:e.snapshotSha256,evaluable:r.evaluable,unavailable:r.unavailable,
   MAE:{value:r.MAE,unit:m.unit},RMSE:{value:r.RMSE,unit:m.unit},bias:{value:r.bias,unit:m.unit},
   percentageError:{metric:'WAPE',value:r.WAPE.value,unit:r.WAPE.unit}},
  scope:{aggregation:'SIN',personalized:false,zonalFallback:false,confidenceStatus:m.confidence.status}};
}
