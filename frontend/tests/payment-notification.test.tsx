import {expect,test,afterEach} from 'bun:test'
import {renderToStaticMarkup} from 'react-dom/server'
import process from 'node:process'
import {PaymentNotice} from '../src/components/BuyerPaymentNotification'
import {getPayableSummary} from '../src/services/simulatedPaymentService'
process.env.VITE_API_BASE_URL='http://enertrade.test'
const fetchOriginal=globalThis.fetch
afterEach(()=>{globalThis.fetch=fetchOriginal})
test('NOTICE-UI-01: aviso identifica una o varias transacciones confirmadas por pagar y acceso a gestión',()=>{
 const single=renderToStaticMarkup(<PaymentNotice summary={{unpaidCount:1,pendingCount:0,totalCount:1,simulated:true}} onNavigate={()=>{throw new Error('No navegar al renderizar')}}/> )
 expect(single).toContain('Tienes una transacción por pagar');expect(single).toContain('Revisar pagos');expect(single).toContain('pago simulado')
 expect(renderToStaticMarkup(<PaymentNotice summary={{unpaidCount:2,pendingCount:0,totalCount:2,simulated:true}} onNavigate={()=>{}}/>)).toContain('2 transacciones por pagar')
})
test('NOTICE-UI-02: pendiente de resolución se distingue de nuevo pago y aprobación elimina aviso',()=>{
 expect(renderToStaticMarkup(<PaymentNotice summary={{unpaidCount:0,pendingCount:1,totalCount:1,simulated:true}} onNavigate={()=>{}}/>)).toContain('pendiente de resolución')
 expect(renderToStaticMarkup(<PaymentNotice summary={{unpaidCount:0,pendingCount:0,totalCount:0,simulated:true}} onNavigate={()=>{}}/>)).toBe('')
})
test('NOTICE-UI-03: consulta compacta autenticada y conteos coherentes',async()=>{
 let request:RequestInit|undefined
 globalThis.fetch=(async(_url,init)=>{request=init;return new Response(JSON.stringify({unpaidCount:1,pendingCount:1,totalCount:2,simulated:true}),{status:200})}) as typeof fetch
 expect((await getPayableSummary()).totalCount).toBe(2);expect(request?.credentials).toBe('include')
 globalThis.fetch=(async()=>new Response(JSON.stringify({unpaidCount:1,pendingCount:1,totalCount:0,simulated:true}),{status:200})) as typeof fetch
 await expect(getPayableSummary()).rejects.toThrow()
})
