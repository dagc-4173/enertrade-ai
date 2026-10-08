import type {EnergyTransaction} from '../types/transactions'
export function transactionNeedsPayment(item:EnergyTransaction){return item.status==='CONFIRMED'&&(item.paymentStatus==='UNPAID'||item.paymentStatus==='PENDING')}
export function transactionPaymentLabel(item:EnergyTransaction){if(item.status!=='CONFIRMED')return null;return item.paymentStatus==='UNPAID'?'Por pagar':item.paymentStatus==='PENDING'?'Pago pendiente de resolución':item.paymentStatus==='PAID'?'Pagada en simulación':null}
