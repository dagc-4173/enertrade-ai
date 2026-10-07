import {createSimulatedReceiptPdf} from '../src/utils/simulatedReceiptPdf'
import {expect,test,spyOn,afterEach} from 'bun:test'
import {renderToStaticMarkup} from 'react-dom/server'
import process from 'node:process'
import {SimulatedReceipt,SimulatedPaymentPanel} from '../src/components/SimulatedPaymentPanel'
import {createSimulatedPayment,isPaymentAttempt,type PaymentAttempt} from '../src/services/simulatedPaymentService'
import type {EnergyTransaction} from '../src/types/transactions'
process.env.VITE_API_BASE_URL='http://enertrade.test'
const attempt:PaymentAttempt={id:'attempt',transactionId:'tx',scenario:'APPROVED',status:'APPROVED',amountCop:'10046.2653625',currency:'COP',providerId:'internal-simulator',providerVersion:'1.0.0',createdAt:'2026-10-07T05:00:00Z',resolvedAt:'2026-10-07T05:00:00Z',receiptReference:'SIM-TEST',simulated:true,contractSnapshot:{quantityKwh:'10.25'}}
const fetchOriginal=globalThis.fetch;afterEach(()=>{globalThis.fetch=fetchOriginal})
test('PAY-UI-01: comprobante indica simulación y no se muestra para rechazo',()=>{
 const html=renderToStaticMarkup(<SimulatedReceipt attempt={attempt}/>);expect(html).toContain('Comprobante de pago simulado');expect(html).toContain('SIM-TEST');expect(html).toContain('No acredita un pago real');expect(renderToStaticMarkup(<SimulatedReceipt attempt={{...attempt,status:'REJECTED',receiptReference:null}}/>)).toBe('')
})
test('PAY-UI-02: pago está separado de aceptación y carga solo al abrir',()=>{
 const html=renderToStaticMarkup(<SimulatedPaymentPanel transaction={{status:'CONFIRMED'} as EnergyTransaction}/>);expect(html).toContain('Ver pago simulado');expect(html).not.toContain('Resultado de prueba');expect(renderToStaticMarkup(<SimulatedPaymentPanel transaction={{status:'PENDING_ACCEPTANCE'} as EnergyTransaction}/>)).toContain('ambas partes confirmen')
})
test('PAY-UI-03: contrato exige simulación, COP y comprobante solo aprobado',()=>{
 expect(isPaymentAttempt(attempt)).toBe(true);expect(isPaymentAttempt({...attempt,simulated:false})).toBe(false);expect(isPaymentAttempt({...attempt,currency:'USD'})).toBe(false);expect(isPaymentAttempt({...attempt,payerUserId:'private'})).toBe(false);expect(isPaymentAttempt({...attempt,receiptReference:null})).toBe(false)
})
test('PAY-UI-04: el cliente envía escenario y clave de intento, nunca importe o tarjetas',async()=>{
 const fetch=spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({attempt,replayed:false}),{status:201,headers:{'Content-Type':'application/json'}}));await createSimulatedPayment('tx','APPROVED','request-key');
 const body=JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));expect(body).toEqual({transactionId:'tx',scenario:'APPROVED',requestKey:'request-key'});expect(fetch.mock.calls[0]?.[1]?.credentials).toBe('include')
})

test('PAY-PDF-01: PDF real conserva importe exacto, referencia, aviso y hora final',()=>{
 const pdf=createSimulatedReceiptPdf({...attempt,contractSnapshot:{quantityKwh:'10.25',pricePerKwh:'980.12345',hour:23,deliveryDate:'2026-10-08'}})
 const output=pdf.output()
 expect(output.startsWith('%PDF-')).toBe(true)
 expect(output).toContain('10046.2653625')
 expect(output).toContain('SIM-TEST')
 expect(output).toContain('23:00 - 00:00')
 expect(output).toContain('No acredita un pago real')
 expect(pdf.getNumberOfPages()).toBe(1)
 expect(renderToStaticMarkup(<SimulatedReceipt attempt={attempt}/>)).toContain('Descargar comprobante PDF')
})
test('PAY-PDF-02: no genera comprobante para pago rechazado o pendiente',()=>{
 for(const status of ['REJECTED','PENDING'] as const) expect(()=>createSimulatedReceiptPdf({...attempt,status,receiptReference:null})).toThrow()
})
