import { loadDirectSupplyModel } from '@/models/xm-gene-ridge-direct-v2/model-loader';
export function getForecastMetrics(horizonDays: number){
  const m=loadDirectSupplyModel(horizonDays),e=m.metrics.externalHoldout;
  return {status:'available',modelId:m.modelId,modelVersion:m.modelVersion,active:true,modelStatus:'experimental',academicValidation:'pending',forecastType:'generation_availability_proxy',target:'energia_kwh',unit:'kWh',horizonPeriods:24,horizonDays:m.horizonDays,baselineReference:m.baselineReference,
    training:{trainedAt:null,trainedAtStatus:'not_recorded',snapshotSha256:m.corpusHash,sourceRange:m.trainingRange,effectiveRange:m.trainingRange},
    evaluation:{type:'external_temporal_holdout',range:m.externalHoldoutRange,snapshotSha256:m.corpusHash,evaluable:e.evaluable,unavailable:e.unavailable,MAE:{value:e.MAE,unit:'kWh'},RMSE:{value:e.RMSE,unit:'kWh'},bias:{value:e.bias,unit:'kWh'},percentageError:{metric:'WAPE',value:e.WAPE,unit:'percent'}}};
}
