import {readFileSync} from 'node:fs';
import {calendarDate, ForecastError, object} from '@/services/forecast.contract';
import {loadModel, type ForecastModel} from './model-loader';
import type artifact from './1.0.0/evaluation.json';
export type Evaluation = typeof artifact;
function freeze<T>(v:T):T { if(v && typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v; }
export function validateEvaluation(v:unknown,m:ForecastModel):Evaluation {
  const bad=()=>{throw new ForecastError(409,'FORECAST_MODEL_INCOMPATIBLE');};
  if(!object(v))return bad();
  if(v.modelId!==m.modelId||v.modelVersion!==m.modelVersion||v.trainingSnapshotSha256!==m.trainingSnapshotSha256||v.evaluationType!=='external_temporal_holdout')return bad();
  const r=v.evaluationRange;
  if(!object(r)||!calendarDate(r.start)||!calendarDate(r.end)||r.start>r.end||r.start<=m.trainingSourceRange.end)return bad();
  if(typeof v.evaluationSnapshotSha256!=='string'||! /^[a-f0-9]{64}$/.test(v.evaluationSnapshotSha256)||v.evaluationSnapshotSha256!==m.evaluationSummary.holdoutSnapshotSha256||r.start!==m.evaluationSummary.holdoutRange[0]||r.end!==m.evaluationSummary.holdoutRange[1])return bad();
  if(!Number.isSafeInteger(v.evaluable)||v.evaluable<=0||!Number.isSafeInteger(v.unavailable)||v.unavailable<0||!object(v.metrics))return bad();
  for(const k of ['MAE','RMSE','bias','WAPE']){
    const x=v.metrics[k];
    if(!object(x)||typeof x.value!=='number'||!Number.isFinite(x.value)||(k!=='bias'&&x.value<0)||x.unit!==(k==='WAPE'?'percent':'kWh'))return bad();
  }
  const w=v.metrics.WAPE;
  if(typeof w.numeratorAbsoluteErrorKwh!=='number'||!Number.isFinite(w.numeratorAbsoluteErrorKwh)||w.numeratorAbsoluteErrorKwh<0||typeof w.denominatorAbsoluteActualKwh!=='number'||!Number.isFinite(w.denominatorAbsoluteActualKwh)||w.denominatorAbsoluteActualKwh<=0||v.trainedAt!==null||v.trainedAtStatus!=='not_recorded')return bad();
  const recorded=m.evaluationSummary.metrics.Ridge;
  if(v.evaluable!==recorded.evaluable||v.unavailable!==recorded.unavailable||(['MAE','RMSE','bias'] as const).some(k=>v.metrics[k].value!==recorded[k]))return bad();
  return freeze(structuredClone(v)) as Evaluation;
}
export function createEvaluationLoader(read:()=>string,model=loadModel){
  let done=false;let result:Evaluation|undefined;
  return ()=>{const m=model();if(!done){done=true;try{result=validateEvaluation(JSON.parse(read()),m);}catch{/* Cache safe failure. */}}
    if(!result)throw new ForecastError(409,'FORECAST_MODEL_INCOMPATIBLE');return result;};
}
export const loadEvaluation=createEvaluationLoader(()=>readFileSync(new URL('./1.0.0/evaluation.json',import.meta.url),'utf8'));
