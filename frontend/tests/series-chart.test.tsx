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
test('gráfica conserva escala constante y no une periodos numéricos faltantes',()=>{
 const html=renderToStaticMarkup(<SeriesChart title="Serie con huecos" description="Prueba" unit="kWh" state={{kind:'success',lines:[{id:'gap',label:'Sin imputar',color:'#00652e',points:[{key:'1',label:'P1',value:5,detail:'5 kWh'},{key:'3',label:'P3',value:5,detail:'5 kWh'}]}]}} />)
 expect(html).not.toContain('NaN');expect(html).not.toContain('Infinity');
 const path=html.match(/<path d="([^"]+)"/);expect(path?.[1]?.match(/M /g)).toHaveLength(2);
 expect(html).toContain('usa Tab');
});
