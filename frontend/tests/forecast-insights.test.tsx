import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { compareForecast, summarizeForecast } from '../src/utils/forecastInsights'
import { ModelPerformance } from '../src/components/forecasts/ModelPerformance'
import { ForecastInsights } from '../src/components/forecasts/ForecastInsights'
import { parseForecastObservations } from '../src/services/forecastObservationsService'

test('INS-01: energía se suma y precio se promedia, sin sumar tarifas', () => {
 const rows=[{period:1,value:10},{period:2,value:30}]
 expect(summarizeForecast(rows,'kWh')?.primary).toBe(40)
 expect(summarizeForecast(rows,'COP/kWh')?.primary).toBe(20)
 expect(summarizeForecast([],'kWh')).toBeNull()
})
test('INS-02: errores alineados por periodo, negativos, cero real y pares incompletos', () => {
 const forecast=[{period:1,value:12},{period:2,value:16}]
 const m=compareForecast(forecast,[{period:2,value:20},{period:1,value:10}])!
 expect(m.MAE).toBe(3);expect(m.RMSE).toBeCloseTo(Math.sqrt(10));expect(m.bias).toBe(-1);expect(m.WAPE).toBe(20)
 expect(compareForecast(forecast,[{period:1,value:10}])).toBeNull()
 expect(compareForecast(forecast,[{period:1,value:10},{period:1,value:20}])).toBeNull()
 expect(compareForecast([{period:1,value:3}],[{period:1,value:0}])?.WAPE).toBeNull()
})
test('INS-03: unidades, ámbito y diferencia de horizonte visibles, sin exactitud inventada', () => {
 const html=renderToStaticMarkup(<ModelPerformance name="Chronos-2" source="XM DemaReal" unit="kWh" selectedHorizon={5} evaluatedHorizon={1} elapsedMs={1234} metrics={{MAE:10,RMSE:12,WAPE_percent:3,bias:-1,n:100,range:{start:'2025-01-01',end:'2025-06-30'},coverageQ10Q90:.7}} />)
 expect(html).toContain('h1');expect(html).toContain('h5');expect(html).toContain('no es un porcentaje de exactitud');expect(html).toContain('100');expect(html).toContain('Incluye red');expect(html).toContain('subestima')
 const pending=renderToStaticMarkup(<ModelPerformance name="Bolt" source="XM Gene" unit="kWh" metrics={null} />)
 expect(pending).toContain('pendiente');expect(pending).not.toContain('error promedio')
})
test('INS-04: predicción futura muestra P50 y cuantiles sin columnas ni consulta de errores', () => {
 const html=renderToStaticMarkup(<ForecastInsights series="demand" targetDate="2099-01-03" originDate="2098-12-30" rows={[{period:1,value:10,low:8,high:12}]} />)
 expect(html).toContain('Pronóstico P50');expect(html).toContain('P10');expect(html).toContain('P90');expect(html).toContain('no es la mediana probabilística')
 for(const text of ['Real del día objetivo','Error absoluto','No calculable','Pendiente de observación','Contrastar con el día real','Consultar observaciones'])expect(html).not.toContain(text)
 expect(html.match(/<th scope="col"/g)).toHaveLength(4)
})
test('INS-05: contrato rechaza fecha/variable ajena, duplicados y día incompleto', () => {
 const value={series:'demand',date:'2026-10-20',source:'XM DemaReal/Sistema',unit:'kWh',status:'available',checkedAt:'2026-10-30T15:00:00Z',points:Array.from({length:24},(_,i)=>({period:i+1,value:i+3}))}
 expect(parseForecastObservations(value,'demand',value.date).points).toHaveLength(24)
 for(const changed of [{date:'2026-10-19'},{source:'XM DemaSIN/Sistema'},{points:value.points.slice(1)},{points:value.points.map(p=>({...p,period:1}))}])expect(()=>parseForecastObservations({...value,...changed},'demand',value.date)).toThrow()
})

for (const series of ['supply','demand','price','daily'] as const) {
 test(`INS-06-${series}: tabla puntual conserva solo fecha/periodo y pronóstico`,()=>{
  const html=renderToStaticMarkup(<ForecastInsights series={series} targetDate="2099-01-03" originDate="2098-12-30" rows={[{period:1,value:10}]} />)
  expect(html.match(/<th scope="col"/g)).toHaveLength(2)
  expect(html).not.toContain('Real del día objetivo');expect(html).not.toContain('No calculable');expect(html).not.toContain('P10');expect(html).not.toContain('<button')
  expect(html).toContain(series==='price'?'COP/kWh':'kWh')
 })
}
