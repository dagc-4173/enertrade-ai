import {useEffect,useState} from 'react'
import {getPayableSummary,type PayableSummary} from '../services/simulatedPaymentService'
import {useVisiblePolling} from '../hooks/useVisiblePolling'
export function PaymentNotice({summary,onNavigate}:{summary:PayableSummary;onNavigate:()=>void}){
 if(summary.totalCount===0)return null
 return <section className="buyer-payment-notice" aria-label="Transacciones por pagar" role="status"><div><strong>{summary.unpaidCount===1?'Tienes una transacción por pagar':summary.unpaidCount>1?`Tienes ${summary.unpaidCount} transacciones por pagar`:'Tienes pagos pendientes de resolución'}</strong>{summary.unpaidCount>0&&<p>Los acuerdos están confirmados. Registra su pago simulado en Transacciones.</p>}{summary.pendingCount>0&&<p>{summary.pendingCount===1?'Un pago simulado está pendiente de resolución.':`${summary.pendingCount} pagos simulados están pendientes de resolución.`}</p>}</div><button type="button" className="secondary-button" onClick={onNavigate}>Revisar pagos</button></section>
}
export function BuyerPaymentNotification({pageKey,onNavigate}:{pageKey:string;onNavigate:()=>void}){
 const [summary,setSummary]=useState<PayableSummary|null>(null)
 const [error,setError]=useState(false)
 async function refresh(signal?:AbortSignal){try{const value=await getPayableSummary(signal);if(!signal?.aborted){setSummary(value);setError(false)}}catch{if(!signal?.aborted)setError(true)}}
 useEffect(()=>{
  const controller=new AbortController()
  void getPayableSummary(controller.signal).then(value=>{if(!controller.signal.aborted){setSummary(value);setError(false)}}).catch(()=>{if(!controller.signal.aborted)setError(true)})
  return()=>controller.abort()
 },[pageKey])
 useEffect(()=>{
  const controller=new AbortController()
  const update=()=>{void getPayableSummary(controller.signal).then(value=>{if(!controller.signal.aborted){setSummary(value);setError(false)}}).catch(()=>{if(!controller.signal.aborted)setError(true)})}
  window.addEventListener('enertrade:payments-changed',update)
  return()=>{controller.abort();window.removeEventListener('enertrade:payments-changed',update)}
 },[])
 useVisiblePolling(refresh,30000,true)
 return <>{summary&&<PaymentNotice summary={summary} onNavigate={onNavigate}/ >}{error&&<p role="status">No se pudo actualizar el aviso de pagos. Consulta Transacciones.</p>}</>
}
