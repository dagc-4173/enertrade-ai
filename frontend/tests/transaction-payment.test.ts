import {expect,test} from 'bun:test'
import {transactionNeedsPayment,transactionPaymentLabel} from '../src/utils/transactionPayment'
import type {EnergyTransaction} from '../src/types/transactions'
test('PAY-ROW-01: solo acuerdos confirmados sin pago aprobado se resaltan',()=>{
 for(const paymentStatus of ['UNPAID','PENDING','PAID',undefined] as const){const row={status:'CONFIRMED',paymentStatus} as EnergyTransaction;expect(transactionNeedsPayment(row)).toBe(paymentStatus==='UNPAID'||paymentStatus==='PENDING')}
 expect(transactionNeedsPayment({status:'PENDING_ACCEPTANCE',paymentStatus:'UNPAID'} as EnergyTransaction)).toBe(false)
})
test('PAY-ROW-02: texto distingue falta de pago, resolución pendiente y aprobación',()=>{
 expect(transactionPaymentLabel({status:'CONFIRMED',paymentStatus:'UNPAID'} as EnergyTransaction)).toBe('Por pagar')
 expect(transactionPaymentLabel({status:'CONFIRMED',paymentStatus:'PENDING'} as EnergyTransaction)).toBe('Pago pendiente de resolución')
 expect(transactionPaymentLabel({status:'CONFIRMED',paymentStatus:'PAID'} as EnergyTransaction)).toBe('Pagada en simulación')
})
