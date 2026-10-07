import {expect,test} from 'bun:test';
import {randomUUID} from 'node:crypto';
import {createSimulatedPaymentService,paymentInput} from '@/services/simulated-payment.service';
const buyer=randomUUID(),seller=randomUUID(),outsider=randomUUID(),id=randomUUID();
function fixture(status='CONFIRMED'){
 const transaction={id,buyerUserId:buyer,sellerUserId:seller,status,quantityKwh:{toString:()=> '10.25'},pricePerKwh:{toString:()=> '980.12345'},totalAmountCop:{toString:()=> '10046.2653625'},deliveryDate:new Date('2026-10-08T00:00:00Z'),hour:8,offerId:randomUUID(),demandId:randomUUID(),confirmedAt:new Date('2026-10-07T05:00:00Z')};
 const attempts:any[]=[];
 const matches=(row:any,where:any)=>Object.entries(where).every(([key,value])=>row[key]===value);
 const table={findUnique:async({where}:any)=>where.id?attempts.find(row=>row.id===where.id)??null:attempts.find(row=>matches(row,where.transactionId_requestKey))??null,findUniqueOrThrow:async({where}:any)=>attempts.find(row=>row.id===where.id),findFirst:async({where}:any)=>attempts.find(row=>matches(row,where))??null,findMany:async()=>attempts,create:async({data}:any)=>{const row={id:randomUUID(),...data,createdAt:new Date('2026-10-07T05:00:00Z')};attempts.push(row);return row},update:async({where,data}:any)=>{const row=attempts.find(value=>value.id===where.id);Object.assign(row,data);return row}};
 const tx={energyTransaction:{findUnique:async()=>transaction},simulatedPaymentAttempt:table,$queryRaw:async()=>[]};
 const database={...tx,$transaction:async(action:any)=>action(tx)};
 return {service:createSimulatedPaymentService(database as any,()=>new Date('2026-10-07T05:00:00Z')),database,attempts,transaction};
}
test('PAY-ISOLATED: no registra ni resuelve pagos con participantes fuera del fixture',async()=>{
 const memory=fixture();
 const scoped=createSimulatedPaymentService(memory.database as any,undefined,{userIds:[buyer]});
 const body={transactionId:id,scenario:'PENDING',requestKey:randomUUID()};
 await expect(scoped.create(buyer,body)).rejects.toMatchObject({status:404});
 expect(memory.attempts).toHaveLength(0);
 const pending=(await memory.service.create(buyer,body)).attempt;
 await expect(scoped.resolve(buyer,pending.id,{outcome:'APPROVED'})).rejects.toMatchObject({status:404});
 expect(memory.attempts[0].status).toBe('PENDING');
 await expect(scoped.list(buyer,id)).rejects.toMatchObject({status:404});
});
test('PAY-01: importe y comprobante se toman del acuerdo, sin exponer clave/pagador',async()=>{
 const {service}=fixture();const result=await service.create(buyer,{transactionId:id,scenario:'APPROVED',requestKey:randomUUID()});
 expect(result.attempt.amountCop).toBe('10046.2653625');expect(result.attempt.receiptReference).toStartWith('SIM-');expect(result.attempt.simulated).toBe(true);expect(result.attempt).not.toHaveProperty('payerUserId');expect(result.attempt).not.toHaveProperty('requestKey');
});
test('PAY-02: repetición de clave conserva un intento; mismo pago no se aprueba dos veces',async()=>{
 const {service,attempts}=fixture();const body={transactionId:id,scenario:'APPROVED',requestKey:randomUUID()};const first=await service.create(buyer,body);const replay=await service.create(buyer,body);
 expect(replay.replayed).toBe(true);expect(replay.attempt.id).toBe(first.attempt.id);expect(attempts).toHaveLength(1);
 await expect(service.create(buyer,{...body,requestKey:randomUUID()})).rejects.toMatchObject({code:'SIMULATED_PAYMENT_ALREADY_APPROVED'});
 await expect(service.create(buyer,{...body,scenario:'REJECTED'})).rejects.toMatchObject({code:'PAYMENT_REQUEST_KEY_REUSED'});
});
test('PAY-03: solo comprador y acuerdo confirmado; vendedor consulta y tercero no accede',async()=>{
 const body={transactionId:id,scenario:'APPROVED',requestKey:randomUUID()};const {service}=fixture();
 await expect(service.create(seller,body)).rejects.toMatchObject({status:403});await expect(service.create(outsider,body)).rejects.toMatchObject({status:404});
 await expect(fixture('PENDING_ACCEPTANCE').service.create(buyer,body)).rejects.toMatchObject({code:'PAYMENT_REQUIRES_CONFIRMED_TRANSACTION'});
 expect((await service.list(seller,id)).status).toBe('UNPAID');await expect(service.list(outsider,id)).rejects.toMatchObject({status:404});
});
test('PAY-04: rechazado permite reintentar; pendiente bloquea otro intento hasta resolución',async()=>{
 const {service,attempts,transaction}=fixture();const create=(scenario:string)=>service.create(buyer,{transactionId:id,scenario,requestKey:randomUUID()});
 expect((await create('REJECTED')).attempt.receiptReference).toBeNull();const pending=(await create('PENDING')).attempt;
 await expect(create('APPROVED')).rejects.toMatchObject({code:'SIMULATED_PAYMENT_PENDING'});
 expect((await service.resolve(buyer,pending.id,{outcome:'REJECTED'})).status).toBe('REJECTED');expect((await create('APPROVED')).attempt.status).toBe('APPROVED');expect(attempts).toHaveLength(3);expect(transaction.status).toBe('CONFIRMED');
});
test('PAY-05: resolución idempotente e inmutabilidad del resultado final',async()=>{
 const {service}=fixture();const pending=(await service.create(buyer,{transactionId:id,scenario:'PENDING',requestKey:randomUUID()})).attempt;
 await expect(service.resolve(seller,pending.id,{outcome:'APPROVED'})).rejects.toMatchObject({status:403});
 const approved=await service.resolve(buyer,pending.id,{outcome:'APPROVED'});expect((await service.resolve(buyer,pending.id,{outcome:'APPROVED'})).receiptReference).toBe(approved.receiptReference);
 await expect(service.resolve(buyer,pending.id,{outcome:'REJECTED'})).rejects.toMatchObject({code:'PAYMENT_ATTEMPT_FINAL'});
});
test.each([{transactionId:id,scenario:'APPROVED',requestKey:randomUUID(),amountCop:'1'}, {transactionId:id,scenario:['APPROVED'],requestKey:randomUUID()}, {transactionId:'bad',scenario:'APPROVED',requestKey:randomUUID()}, {transactionId:id,scenario:'UNKNOWN',requestKey:randomUUID()}])('PAY-06: rechaza manipulación y contratos inválidos',body=>{expect(()=>paymentInput(body)).toThrow()});
