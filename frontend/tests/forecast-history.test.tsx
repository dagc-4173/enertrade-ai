import { expect, test, spyOn } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ForecastHistory, ForecastHistoryDetail } from '../src/components/forecasts/ForecastHistory'
import { ForecastSavedNotice } from '../src/components/forecasts/ForecastSavedNotice'
import { Patterns } from '../src/pages/Patterns'
import { parseHistoryDetail, parseHistoryList, getForecastHistory, getForecastHistoryDetail, evaluateForecastHistory } from '../src/services/forecastHistoryService'
const id='11111111-1111-4111-8111-111111111111'
const detail={id,createdAt:'2025-12-30T15:00:00Z',targetDate:'2025-12-31',originDate:'2025-12-30',series:'demand' as const,method:'chronos2' as const,modelId:'amazon/chronos-2',modelVersion:'fixture',source:'XM DemaReal/Sistema',unit:'kWh',horizonDays:1,forecastSha256:'a'.repeat(64),status:'pending' as const,evaluatedAt:null,lastCheckedAt:null,lastCheckStatus:null,metrics:null,predictions:Array.from({length:24},(_,i)=>({period:i+1,value:100+i,low:90+i,high:110+i})),evaluation:null}
test('HIST-UI-01: historial por usuario con filtros, carga y pestaña junto a patrones',()=>{
 const html=renderToStaticMarkup(<ForecastHistory/>);expect(html).toContain('Seguimiento de pronósticos');expect(html).toContain('Fecha objetivo desde');expect(html).toContain('DemaReal');expect(html).toContain('DemaSIN');expect(html).toContain('Cargando tus pronósticos');
 const page=renderToStaticMarkup(<Patterns/>);expect(page).toContain('Patrones energéticos');expect(page).toContain('Seguimiento de pronósticos');expect(page).toContain('Analizar patrones');
});
test('HIST-UI-02: detalle pendiente preserva pronóstico, cuantiles y columnas sin inventar ceros',()=>{
 const html=renderToStaticMarkup(<ForecastHistoryDetail detail={parseHistoryDetail(detail)} evaluating={false} onEvaluate={()=>{}}/>);
 expect(html).toContain('Evaluar con datos XM');expect(html).toContain('Real del día objetivo');expect(html).toContain('Error absoluto');expect(html).toContain('No calculable');expect(html).toContain('P10');expect(html).toContain('P90');expect(html).toContain('Horizonte')
});
test('HIST-UI-03: detalle evaluado muestra valores, métricas y trazabilidad de la misma fecha',()=>{
 const metrics={MAE:1,RMSE:1,WAPE:1,bias:-1,n:24}
 const evaluated={...detail,status:'evaluated',evaluatedAt:'2026-01-01T15:00:00Z',metrics,evaluation:{source:detail.source,checkedAt:'2026-01-01T15:00:00Z',observationSha256:'b'.repeat(64),forecastSha256:detail.forecastSha256,metrics,rows:detail.predictions.map(r=>({...r,actual:r.value+1,error:-1,absoluteError:1}))}}
 const parsed=parseHistoryDetail(evaluated),html=renderToStaticMarkup(<ForecastHistoryDetail detail={parsed} evaluating={false} onEvaluate={()=>{}}/>);
 expect(html).toContain('Errores de esta ejecución');expect(html).toContain('Real XM');expect(html).not.toContain('No calculable');expect(html).not.toContain('Evaluar con datos XM');expect(html).toContain('SHA256 de las observaciones');
 for(const change of [{source:'XM DemaSIN/Sistema'},{predictions:detail.predictions.slice(1)},{evaluation:{...evaluated.evaluation,forecastSha256:'c'.repeat(64)}},{evaluation:{...evaluated.evaluation,rows:evaluated.evaluation.rows.map(r=>({...r,error:20}))}}])expect(()=>parseHistoryDetail({...evaluated,...change})).toThrow()
});
test('HIST-UI-04: avisos de persistencia distinguen guardado y fallo sin perder el pronóstico',()=>{
 expect(renderToStaticMarkup(<ForecastSavedNotice history={{status:'saved',id}}/>)).toContain('Patrones');expect(renderToStaticMarkup(<ForecastSavedNotice history={{status:'failed',id:null}}/>)).toContain('no pudo guardarse');expect(renderToStaticMarkup(<ForecastSavedNotice/>)).toContain('servidor');
 expect(parseHistoryList({items:[detail],total:1,page:1,pageSize:20}).items).toHaveLength(1);expect(()=>parseHistoryList({items:[detail],total:0,page:1,pageSize:20})).toThrow()
});

test('HIST-UI-05: listado, detalle y evaluación envían sesión al backend en otro puerto',async()=>{
 const original=globalThis.fetch
 process.env.VITE_API_BASE_URL='http://enertrade.test'
 const request=spyOn(globalThis,'fetch').mockImplementation(async(input,options)=>{
  expect(options?.credentials).toBe('include')
  return Response.json(String(input).includes('/forecast-history?')?{items:[],total:0,page:1,pageSize:20}:detail)
 })
 try{
  await getForecastHistory();await getForecastHistoryDetail(id);await evaluateForecastHistory(id)
  expect(request.mock.calls).toHaveLength(3)
  expect(request.mock.calls[2]?.[1]?.method).toBe('POST')
 }finally{request.mockRestore();globalThis.fetch=original}
})
