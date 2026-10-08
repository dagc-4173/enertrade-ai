import { ApiError, apiRequest, postJson } from './apiClient'
export type PaymentOutcome='APPROVED'|'REJECTED'|'PENDING'
export type PaymentAttempt={id:string;transactionId:string;scenario:PaymentOutcome;status:PaymentOutcome;amountCop:string;currency:'COP';providerId:string;providerVersion:string;createdAt:string;resolvedAt:string|null;receiptReference:string|null;simulated:true;contractSnapshot:Record<string,unknown>}
export type PaymentHistory={transactionId:string;amountCop:string;status:'PAID'|'PENDING'|'UNPAID';simulated:true;attempts:PaymentAttempt[]}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
export function isPaymentAttempt(value:unknown):value is PaymentAttempt{
 return object(value)&&['id','transactionId','amountCop','providerId','providerVersion','createdAt'].every(key=>typeof value[key]==='string')&&/^\d+(?:\.\d+)?$/.test(String(value.amountCop))&&['APPROVED','REJECTED','PENDING'].includes(String(value.status))&&['APPROVED','REJECTED','PENDING'].includes(String(value.scenario))&&value.currency==='COP'&&value.simulated===true&&object(value.contractSnapshot)&&(value.resolvedAt===null||typeof value.resolvedAt==='string')&&(value.status==='APPROVED'?typeof value.receiptReference==='string':value.receiptReference===null)&&!('payerUserId'in value)&&!('requestKey'in value)
}
export async function getSimulatedPayments(id:string,signal?:AbortSignal):Promise<PaymentHistory>{
 const response=await apiRequest<unknown>(`/simulated-payments/transactions/${encodeURIComponent(id)}`,{credentials:'include',signal})
 if(response.status!==200||!object(response.data)||response.data.transactionId!==id||!['PAID','PENDING','UNPAID'].includes(String(response.data.status))||response.data.simulated!==true||typeof response.data.amountCop!=='string'||!Array.isArray(response.data.attempts)||!response.data.attempts.every(isPaymentAttempt))throw new ApiError('response','El historial de pago simulado tiene un formato inesperado.',response.status)
 return response.data as unknown as PaymentHistory
}
export async function createSimulatedPayment(transactionId:string,scenario:PaymentOutcome,requestKey:string){
 const response=await postJson<unknown>('/simulated-payments',{transactionId,scenario,requestKey},{credentials:'include'})
 if(![200,201].includes(response.status)||!object(response.data)||!isPaymentAttempt(response.data.attempt))throw new ApiError('response','El intento de pago tiene un formato inesperado.',response.status)
 return response.data.attempt
}
export async function resolveSimulatedPayment(id:string,outcome:'APPROVED'|'REJECTED'){
 const response=await postJson<unknown>(`/simulated-payments/${encodeURIComponent(id)}/resolve`,{outcome},{credentials:'include'})
 if(response.status!==200||!object(response.data)||!isPaymentAttempt(response.data.attempt))throw new ApiError('response','El resultado del pago tiene un formato inesperado.',response.status)
 return response.data.attempt
}

export type PayableSummary={unpaidCount:number;pendingCount:number;totalCount:number;simulated:true}
export async function getPayableSummary(signal?:AbortSignal):Promise<PayableSummary>{
 const response=await apiRequest<unknown>('/simulated-payments/payables',{credentials:'include',signal})
 const data=response.data
 if(response.status!==200||!object(data)||data.simulated!==true||!['unpaidCount','pendingCount','totalCount'].every(key=>typeof data[key]==='number'&&Number.isSafeInteger(data[key])&&Number(data[key])>=0)||data.totalCount!==Number(data.unpaidCount)+Number(data.pendingCount))throw new ApiError('response','El aviso de pagos no tiene un formato válido.',response.status)
 return data as PayableSummary
}
