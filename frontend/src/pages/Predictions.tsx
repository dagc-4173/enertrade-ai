import { useRef, useState, type KeyboardEvent } from 'react'
import { HourlyDemandPanel } from '../components/forecasts/HourlyDemandPanel'
import { ForecastPanel } from '../components/forecasts/ForecastPanel'
import { EnergyHistoryExplorer } from '../components/charts/EnergyHistoryExplorer'
import './Predictions.css'
import { predictionMethods } from './prediction-methods'

type Variable = 'supply' | 'demand' | 'price'
type Method = 'ridge' | 'chronos2' | 'bolt' | 'daily' | 'b1'
const variables = [
  { key: 'supply', name: 'Oferta', description: 'Generación agregada', unit: 'kWh' },
  { key: 'demand', name: 'Demanda', description: 'Energía consumida', unit: 'kWh' },
  { key: 'price', name: 'Precio', description: 'Referencia de bolsa', unit: 'COP/kWh' },
] as const

export function PredictionContent({ variable, method }: { variable: Variable; method: Method }) {
  if (variable === 'supply' && method === 'ridge') return <ForecastPanel kind="supply" />
  if (variable === 'demand' && method === 'daily') return <ForecastPanel kind="demand" />
  if (variable === 'price' && method === 'b1') return <ForecastPanel kind="price" />
  if (method === 'daily' || method === 'b1') return null
  return <HourlyDemandPanel series={variable} initialModel={method} hideModelSelector />
}

export function Predictions() {
  const [variable, setVariable] = useState<Variable>('supply'), [method, setMethod] = useState<Method>('ridge')
  const [historyOpen, setHistoryOpen] = useState(false)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  function select(next: Variable) { setVariable(next); setMethod('ridge') }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number
    if (event.key === 'ArrowRight') next = (index + 1) % 3
    else if (event.key === 'ArrowLeft') next = (index + 2) % 3
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = 2
    else return
    event.preventDefault(); select(variables[next]!.key); tabs.current[next]?.focus()
  }
  const selected = predictionMethods[variable].find(m => m.key === method)!
  return <div className="predictions-workspace">
    <header className="predictions-intro">
      <div><p className="eyebrow">Análisis del sistema eléctrico</p><h2>Elige qué quieres pronosticar.</h2><p>Consulta oferta, demanda o precio con el modelo y la fecha que necesitas.</p></div>
      <span className="predictions-experimental">Validación académica pendiente</span>
    </header>
    <div className="prediction-tabs" role="tablist" aria-label="Variable del pronóstico">
      {variables.map((item, index) => <button key={item.key} ref={node => { tabs.current[index] = node }} type="button" role="tab" id={`prediction-tab-${item.key}`} aria-selected={variable === item.key} aria-controls={`prediction-view-${item.key}`} tabIndex={variable === item.key ? 0 : -1} onClick={() => select(item.key)} onKeyDown={event => navigate(event, index)}>
        <span className="prediction-tab-title">{item.name}<small>{item.unit}</small></span><span className="prediction-tab-description">{item.description}</span>
      </button>)}
    </div>
    <section className="prediction-view" role="tabpanel" id={`prediction-view-${variable}`} aria-labelledby={`prediction-tab-${variable}`}>
      <div className="prediction-method-bar">
        <label htmlFor="prediction-method">Modelo de pronóstico<select id="prediction-method" value={method} onChange={event => setMethod(event.target.value as Method)}>{predictionMethods[variable].map(m => <option key={m.key} value={m.key}>{m.name}</option>)}</select></label>
        <div className="prediction-method-note"><span>{method === 'b1' ? 'Referencia determinista' : 'Modelo experimental'} · {method === 'daily' ? 'Total diario' : 'Resolución horaria'}</span><p>{selected.description}</p></div>
      </div>
      <div className="prediction-forecast" key={`${variable}/${method}`}><PredictionContent variable={variable} method={method} /></div>
    </section>
    <details className="prediction-history" onToggle={event => setHistoryOpen(event.currentTarget.open)}>
      <summary><span>Consultar datos históricos<small>Explora las observaciones publicadas por XM, por separado del pronóstico.</small></span><span className="prediction-history-action" aria-hidden="true">Abrir / cerrar</span></summary>
      {historyOpen && <EnergyHistoryExplorer />}
    </details>
    <p className="prediction-footnote">Los resultados son experimentales. La generación es una aproximación de oferta y el precio de bolsa es una referencia nacional.</p>
  </div>
}
