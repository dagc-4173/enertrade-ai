import {useEffect,useRef,useState} from 'react'
import type {EnergyTransaction} from '../types/transactions'
import {createSimulatedPayment,getSimulatedPayments,resolveSimulatedPayment,type PaymentAttempt,type PaymentHistory,type PaymentOutcome} from '../services/simulatedPaymentService'
import {useVisiblePolling} from '../hooks/useVisiblePolling'
import {errorMessage} from '../utils/marketplaceActions'
import {formatCurrencyCOP} from '../utils/numberFormat'
const labels:Record<PaymentOutcome,string>={APPROVED:'Aprobado (simulación)',REJECTED:'Rechazado (simulación)',PENDING:'Pendiente (simulación)'}
export function SimulatedReceipt({attempt}:{attempt:PaymentAttempt}){
 const [downloadError,setDownloadError]=useState('')
 const [downloading,setDownloading]=useState(false)
 async function download(){setDownloading(true);setDownloadError('');try{const {downloadSimulatedReceiptPdf}=await import('../utils/simulatedReceiptPdf');downloadSimulatedReceiptPdf(attempt)}catch{setDownloadError('No se pudo generar el PDF. Intenta nuevamente.')}finally{setDownloading(false)}}
 if(attempt.status!=='APPROVED'||!attempt.receiptReference)return null
 return <section className="simulated-receipt" aria-label="Comprobante de pago simulado"><h4>Comprobante de pago simulado</h4><p>Referencia: {attempt.receiptReference}</p><p>Importe: {formatCurrencyCOP(Number(attempt.amountCop))}</p><p>{attempt.resolvedAt&&new Date(attempt.resolvedAt).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</p><p>No acredita un pago real ni una entrega de energía.</p><button type="button" className="secondary-button" disabled={downloading} onClick={()=>{void download()}}>{downloading?'Generando PDF…':'Descargar comprobante PDF'}</button>{downloadError&&<p role="alert">{downloadError}</p>}</section>
}
function PaymentDetails({transaction}:{transaction:EnergyTransaction}){
 const [history,setHistory]=useState<PaymentHistory|null>(null)
 const [scenario,setScenario]=useState<PaymentOutcome>('APPROVED')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const intent=useRef<{key:string;scenario:PaymentOutcome}|null>(null)
 async function refresh(signal?:AbortSignal){try{const loaded=await getSimulatedPayments(transaction.id,signal);if(!signal?.aborted){setHistory(loaded);setError('')}}catch(reason){if(!signal?.aborted)setError(errorMessage(reason))}}
 useEffect(()=>{const controller=new AbortController();getSimulatedPayments(transaction.id,controller.signal).then(value=>{if(!controller.signal.aborted)setHistory(value)}).catch(reason=>{if(!controller.signal.aborted)setError(errorMessage(reason))});return()=>controller.abort()},[transaction.id])
 useVisiblePolling(refresh,5000,true)
 async function pay(){if(busy)return;setBusy(true);setError('');try{if(!intent.current||intent.current.scenario!==scenario)intent.current={key:crypto.randomUUID(),scenario};const attempt=await createSimulatedPayment(transaction.id,scenario,intent.current.key);intent.current=null;window.dispatchEvent(new Event('enertrade:payments-changed'));setNotice(labels[attempt.status]);await refresh()}catch(reason){setError(errorMessage(reason))}finally{setBusy(false)}}
 async function resolve(id:string,outcome:'APPROVED'|'REJECTED'){if(busy)return;setBusy(true);setError('');try{const attempt=await resolveSimulatedPayment(id,outcome);window.dispatchEvent(new Event('enertrade:payments-changed'));setNotice(labels[attempt.status]);await refresh()}catch(reason){setError(errorMessage(reason))}finally{setBusy(false)}}
 const pending=history?.attempts.find(attempt=>attempt.status==='PENDING')
 const approved=history?.attempts.find(attempt=>attempt.status==='APPROVED')
 return <section className="simulated-payment" aria-label="Pago simulado"><h4>Pago simulado</h4><p>Importe del acuerdo: {formatCurrencyCOP(Number(history?.amountCop??transaction.totalAmountCop))}</p><p>Estado: {history?history.status==='PAID'?'Pagado en simulación':history.status==='PENDING'?'Intento pendiente':'Sin pago aprobado':'Consultando…'}</p>
 {transaction.role==='BUYER'&&history&&history.status==='UNPAID'&&<><label>Resultado de prueba<select value={scenario} disabled={busy} onChange={event=>setScenario(event.target.value as PaymentOutcome)}><option value="APPROVED">Aprobado</option><option value="REJECTED">Rechazado</option><option value="PENDING">Pendiente</option></select></label><button type="button" className="primary-button" disabled={busy} onClick={()=>{void pay()}}>{busy?'Procesando…':'Registrar pago simulado'}</button></>}
 {transaction.role==='BUYER'&&pending&&<div className="marketplace-actions"><button type="button" className="secondary-button" disabled={busy} onClick={()=>{void resolve(pending.id,'APPROVED')}}>Simular aprobación del pendiente</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>{void resolve(pending.id,'REJECTED')}}>Simular rechazo del pendiente</button></div>}
 {transaction.role==='SELLER'&&<p>El comprador registra el pago. Puedes consultar sus intentos y comprobante.</p>}
 {approved&&<SimulatedReceipt attempt={approved}/>}
 {history&&<ol aria-label="Intentos de pago simulado">{history.attempts.map(attempt=><li key={attempt.id}>{labels[attempt.status]} · {formatCurrencyCOP(Number(attempt.amountCop))} · {new Date(attempt.createdAt).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</li>)}</ol>}
 {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
 <p>Simulador interno: no solicita tarjetas ni mueve dinero real.</p></section>
}
export function SimulatedPaymentPanel({transaction}:{transaction:EnergyTransaction}){
 const [open,setOpen]=useState(false)
 if(transaction.status!=='CONFIRMED')return <p>Pago simulado disponible cuando ambas partes confirmen el acuerdo.</p>
 return <div><button type="button" className="secondary-button" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?'Ocultar pago simulado':'Ver pago simulado'}</button>{open&&<PaymentDetails transaction={transaction}/>}</div>
}
