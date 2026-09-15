import {readFileSync} from 'node:fs';
import {calendarDate,ForecastError,object} from '@/services/forecast.contract';
import type artifact from './1.0.0/model.json';
export type ForecastModel=typeof artifact;
const features=['demand_D_minus_1','demand_D_minus_7','demand_D_minus_14','demand_D_minus_28','weekday_sin','weekday_cos'];
function freeze<T>(v:T):T {if(v && typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export function validateModel(v:unknown):ForecastModel {
 const bad=():never=>{throw new ForecastError(409,'FORECAST_MODEL_INCOMPATIBLE');};
 if(!object(v))return bad();
 const expected={modelId:'xm-demandasin-ridge',modelVersion:'1.0.0',modelType:'ridge',alpha:100,weekdayConvention:'monday=0..sunday=6',compatibleProfile:'xm_demandasin_preparacion_base@1.0.0',compatibleRuleset:'xm_demandasin_base@1.0.0',target:'demanda_kwh',unit:'kWh',forecastType:'aggregate_demand_proxy',horizonDays:1,effectiveTrainingRows:337};
 if(Object.entries(expected).some(([k,x])=>v[k]!==x))return bad();
 const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
 const vector=(x:unknown)=>Array.isArray(x)&&x.length===6&&x.every(finite);
 if(!Array.isArray(v.orderedFeatures)||v.orderedFeatures.length!==6||features.some((f,i)=>v.orderedFeatures[i]!==f)||!object(v.scaler)||v.scaler.ddof!==0||!vector(v.scaler.means)||!vector(v.scaler.standardDeviations)||v.scaler.standardDeviations.some((s:number)=>s<=0)||!vector(v.coefficients)||!finite(v.intercept))return bad();
 for(const r of [v.trainingSourceRange,v.effectiveTrainingRange,v.externalHoldoutRange])if(!object(r)||!calendarDate(r.start)||!calendarDate(r.end)||r.start>r.end)return bad();
 if(v.effectiveTrainingRange.start<v.trainingSourceRange.start||v.effectiveTrainingRange.end>v.trainingSourceRange.end||v.externalHoldoutRange.start<=v.trainingSourceRange.end||(Date.parse(v.effectiveTrainingRange.end)-Date.parse(v.effectiveTrainingRange.start))/86400000+1!==v.effectiveTrainingRows)return bad();
 for(const k of ['trainingSnapshotSha256','externalHoldoutSnapshotSha256'])if(typeof v[k]!=='string'||!/^[a-f0-9]{64}$/.test(v[k]))return bad();
 if(!object(v.confidence)||v.confidence.value!==null||v.confidence.status!=='not_defined')return bad();
 const e=v.evaluationSummary;
 if(!object(e)||!object(e.metrics)||!object(e.promotionRule)||!object(e.criterionResults)||e.selectedForImplementation!==true)return bad();
 const days=(Date.parse(v.externalHoldoutRange.end)-Date.parse(v.externalHoldoutRange.start))/86400000+1;
 const close=(x:number,y:number)=>Math.abs(x-y)<=1e-10*Math.max(1,Math.abs(y));
 for(const name of ['B1','B7','Ridge']){
  const m=e.metrics[name];if(!object(m)||!Number.isSafeInteger(m.evaluable)||m.evaluable<=0||!Number.isSafeInteger(m.unavailable)||m.unavailable<0||m.evaluable+m.unavailable!==days||!finite(m.MAE)||m.MAE<0||!finite(m.RMSE)||m.RMSE<m.MAE||!finite(m.bias)||Math.abs(m.bias)>m.MAE+1e-7||!object(m.WAPE))return bad();
  const w=m.WAPE;if(w.unit!=='percent'||!finite(w.value)||w.value<0||!finite(w.numeratorAbsoluteErrorKwh)||w.numeratorAbsoluteErrorKwh<0||!finite(w.denominatorAbsoluteActualKwh)||w.denominatorAbsoluteActualKwh<=0||!close(w.value,100*w.numeratorAbsoluteErrorKwh/w.denominatorAbsoluteActualKwh)||!close(m.MAE,w.numeratorAbsoluteErrorKwh/m.evaluable))return bad();
 }
 const r=e.metrics.Ridge,b=e.metrics.B7,relative=100*(r.MAE-b.MAE)/b.MAE;
 const rule={zeroModelUnavailable:true,maximumRelativeMAEvsB7Percent:5,strictImprovementRequired:'MAE < B7 MAE OR RMSE < B7 RMSE',finiteWAPEPositiveDenominator:true,noLeakageOrNumericalFailure:true};
 if(Object.entries(rule).some(([k,x])=>e.promotionRule[k]!==x)||!finite(e.relativeMAEvsB7)||!close(e.relativeMAEvsB7,relative)||r.unavailable!==0||relative>5||!(r.MAE<b.MAE||r.RMSE<b.RMSE))return bad();
 for(const k of ['zeroModelUnavailable','MAENoMoreThan5PercentWorseThanB7','MAEOrRMSEStrictlyBetterThanB7','finiteWAPEAndPositiveDenominator','noLeakageOrNumericalFailure'])if(e.criterionResults[k]!==true)return bad();
 return freeze(structuredClone(v)) as ForecastModel;
}
export function createModelLoader(read:()=>string){let done=false;let model:ForecastModel|undefined;return ()=>{if(!done){done=true;try{model=validateModel(JSON.parse(read()));}catch{/* Cache safe failure. */}}if(!model)throw new ForecastError(409,'FORECAST_MODEL_INCOMPATIBLE');return model;};}
export const loadModel=createModelLoader(()=>readFileSync(new URL('./1.0.0/model.json',import.meta.url),'utf8'));
