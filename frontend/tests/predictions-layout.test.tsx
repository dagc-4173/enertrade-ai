import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Predictions, PredictionContent } from '../src/pages/Predictions'
import { predictionMethods } from '../src/pages/prediction-methods'

test('UI-PRED-01: one view and model control, accessible tabs and no eager history', () => {
  const html = renderToStaticMarkup(<Predictions />)
  expect(html.match(/role="tab"/g)).toHaveLength(3)
  expect(html.match(/role="tabpanel"/g)).toHaveLength(1)
  expect(html).toContain('aria-selected="true"')
  expect(html).toContain('id="prediction-method"')
  expect(html).not.toContain('Histórico energético')
  expect(html).toContain('Consultar datos históricos')
})
test('UI-PRED-02: daily demand and B1 remain explicit alternative methods', () => {
  expect(predictionMethods.demand.find(m => m.key === 'daily')?.description).toContain('DemaSIN')
  expect(predictionMethods.price.find(m => m.key === 'b1')?.description).toContain('determinista')
  const daily = renderToStaticMarkup(<PredictionContent variable="demand" method="daily" />)
  expect(daily).toContain('Demanda energética'); expect(daily).not.toContain('Chronos-2')
  const price = renderToStaticMarkup(<PredictionContent variable="price" method="b1" />)
  expect(price).toContain('Regla determinista · B1')
  expect(price).toContain('Selecciona un dataset preparado')
})
test('UI-PRED-03: hourly Ridge/Chronos use one shared selector and correct variable panel', () => {
  for (const variable of ['demand', 'price'] as const) {
    const ridge = renderToStaticMarkup(<PredictionContent variable={variable} method="ridge" />)
    expect(ridge).toContain('Fecha objetivo')
    expect(ridge).not.toContain('<option value="chronos2">')
    expect(ridge).toContain('Generar pronóstico')
  }
  expect(renderToStaticMarkup(<PredictionContent variable="supply" method="chronos2" />)).toContain('Oferta horaria experimental')
})
