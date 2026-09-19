import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { SeriesChart } from '../src/components/charts/SeriesChart'

const success = { kind: 'success' as const, lines: [{ id: 'real', label: 'XM real', color: '#00652e', points: [{ key: '1', label: 'P1', value: 1234.56, detail: '15/09/2026, periodo 1: 1.234,56 kWh' }] }] }

test('gráfica de datos reales muestra punto, unidad, leyenda y tooltip accesible', () => {
  const html = renderToStaticMarkup(<SeriesChart title="Supply" description="Serie real" unit="kWh" state={success} />)
  expect(html).toContain('XM real'); expect(html).toContain('1.234,56'); expect(html).toContain('periodo 1'); expect(html).toContain('tabindex="0"')
})
test('gráfica expresa loading, empty y error sin puntos falsos', () => {
  expect(renderToStaticMarkup(<SeriesChart title="Loading" description="" unit="kWh" state={{ kind: 'loading' }} />)).toContain('Cargando serie histórica real')
  expect(renderToStaticMarkup(<SeriesChart title="Empty" description="" unit="kWh" state={{ kind: 'empty', message: 'Sin datos reales.' }} />)).toContain('Sin datos reales.')
  const error = renderToStaticMarkup(<SeriesChart title="Error" description="" unit="kWh" state={{ kind: 'error', message: 'Falló la API.' }} />)
  expect(error).toContain('role="alert"'); expect(error).toContain('Falló la API.')
})