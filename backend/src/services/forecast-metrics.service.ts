import {loadModel} from '@/models/xm-gene-ridge/model-loader';
import {loadEvaluation} from '@/models/xm-gene-ridge/evaluation-loader';
export function getForecastMetrics(){
  const m=loadModel(),e=loadEvaluation();
  return {status:'available',modelId:m.modelId,modelVersion:m.modelVersion,active:true,forecastType:m.forecastType,target:m.target,unit:m.unit,horizonPeriods:m.horizonPeriods,
    training:{trainedAt:e.trainedAt,trainedAtStatus:e.trainedAtStatus,snapshotSha256:m.trainingSnapshotSha256,sourceRange:m.trainingSourceRange,effectiveRange:m.effectiveTrainingRange},
    evaluation:{type:e.evaluationType,range:e.evaluationRange,snapshotSha256:e.evaluationSnapshotSha256,evaluable:e.evaluable,unavailable:e.unavailable,MAE:e.metrics.MAE,RMSE:e.metrics.RMSE,bias:e.metrics.bias,percentageError:{metric:'WAPE',value:e.metrics.WAPE.value,unit:e.metrics.WAPE.unit}}};
}
