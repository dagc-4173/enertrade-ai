import {test,expect} from 'bun:test';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {Prisma} from '@/generated/prisma/client';
import {createSettlementService,settlementAmounts,settlementInput,deliveryEnded} from '@/services/simulated-settlement.service';
import {createSettlementRouter} from '@/controllers/simulated-settlement.controller';
const buyer=randomUUID(),seller=randomUUID(),admin=randomUUID(),other=randomUUID(),id=randomUUID();
function fixture(){
 let row:any=null;let locked=0;
 const t:any={id,buyerUserId:buyer,sellerUserId:seller,status:'CONFIRMED',quantityKwh:new Prisma.Decimal('10000'),pricePerKwh:new Prisma.Decimal('500'),totalAmountCop:new Prisma.Decimal('5000000'),deliveryDate:new Date('2026-10-30T00:00:00Z'),hour:23,paymentAttempts:[{status:'APPROVED',providerVersion:'2.0.0'}]};
 const users:Record<string,any>={[buyer]:{status:'ACTIVE',role:'USER'},[seller]:{status:'ACTIVE',role:'USER'},[admin]:{status:'ACTIVE',role:'ADMIN'},[other]:{status:'ACTIVE',role:'USER'}};
 const tx:any={user:{findUnique:async({where}:any)=>users[where.id]},$queryRaw:async()=>{locked++;return []},energyTransaction:{findUnique:async({where}:any)=>where.id===id?{...t,settlement:row}:null},simulatedSettlement:{findUnique:async()=>row,findMany:async()=>row?.status==='DISPUTED'?[{...row,transaction:t}]:[],upsert:async({create,update}:any)=>{row={...(row??create),...update};for(const k of ['declaredKwh','acceptedKwh','sellerAmountCop','refundAmountCop'])if(row[k]!=null)row[k]=new Prisma.Decimal(row[k]);return row}}};
 const db:any={...tx,$transaction:async(fn:any)=>fn(tx)};let clock=new Date('2026-10-31T05:00:00Z');
 const service=createSettlementService(db,()=>clock);
 return {service,t,users,db,setClock:(d:string)=>{clock=new Date(d)},locks:()=>locked};
}
const request=(action:string,rest:Record<string,string>={})=>({action,requestKey:randomUUID(),...rest});
test.each(['0','8000','10000'])('SET-01: entrega %s conserva total, liquida solo comprador y no duplica',async q=>{
 const f=fixture();expect((await f.service.get(buyer,id)).status).toBe('HELD');
 const report=request('REPORT',{quantityKwh:q,evidenceReference:'Acta de prueba 001'});
 expect((await f.service.act(seller,id,report)).status).toBe('REVIEW');
 expect((await f.service.act(seller,id,report)).events).toHaveLength(1);
 await expect(f.service.act(seller,id,request('ACCEPT'))).rejects.toMatchObject({status:403});
 const accept=request('ACCEPT'),r=await f.service.act(buyer,id,accept);
 expect(r.sellerAmountCop).toBe(new Prisma.Decimal(q).mul(500).toString());
 expect(new Prisma.Decimal(r.sellerAmountCop!).add(r.refundAmountCop!).toString()).toBe('5000000');
 expect((await f.service.act(buyer,id,accept)).events).toHaveLength(2);
 await expect(f.service.act(buyer,id,request('ACCEPT'))).rejects.toMatchObject({code:'ALREADY_SETTLED'});
 await expect(f.service.act(seller,id,{...report,quantityKwh:'1'})).rejects.toMatchObject({code:'REQUEST_KEY_REUSED'});
 expect(r.events[0]).not.toHaveProperty('actorId');expect(r.events[0]).not.toHaveProperty('payload');expect(f.locks()).toBeGreaterThan(0);
});
test.each([false,true])('SET-02: disputa con/sin declaración; solo admin independiente resuelve (%s)',async report=>{
 const f=fixture();if(report)await f.service.act(seller,id,request('REPORT',{quantityKwh:'9000',evidenceReference:'Referencia de acta'}));
 const d=await f.service.act(buyer,id,request('DISPUTE',{reason:'No se recibió la energía acordada'}));expect(d.status).toBe('DISPUTED');expect(d.sellerAmountCop).toBeNull();
 expect((await f.service.disputes(admin)).disputes).toHaveLength(1);
 await expect(f.service.disputes(buyer)).rejects.toMatchObject({status:403});
 await expect(f.service.act(buyer,id,request('RESOLVE',{quantityKwh:'8000',reason:'Resolución de prueba'}))).rejects.toMatchObject({status:403});
 f.users[buyer].role='ADMIN';await expect(f.service.act(buyer,id,request('RESOLVE',{quantityKwh:'8000',reason:'Resolución de prueba'}))).rejects.toMatchObject({code:'INDEPENDENT_ADMIN_REQUIRED'});
 const result=await f.service.act(admin,id,request('RESOLVE',{quantityKwh:'8000',reason:'Acta revisada por tercero'}));expect(result.sellerAmountCop).toBe('4000000');expect(result.refundAmountCop).toBe('1000000');expect(result.resolutionReason).toContain('Acta');
});
test('SET-03: protege identidad, alcance, pagos antiguos y periodos futuros',async()=>{
 const f=fixture();await expect(f.service.get(other,id)).rejects.toMatchObject({status:404});
 await expect(f.service.act(other,id,request('DISPUTE',{reason:'Motivo de prueba'}))).rejects.toMatchObject({status:404});
 f.users[seller].status='BLOCKED';await expect(f.service.act(seller,id,request('REPORT',{quantityKwh:'0',evidenceReference:'Sin entrega real'}))).rejects.toMatchObject({status:403});f.users[seller].status='ACTIVE';
 f.setClock('2026-10-31T04:59:59Z');await expect(f.service.act(buyer,id,request('DISPUTE',{reason:'Motivo de prueba'}))).rejects.toMatchObject({code:'DELIVERY_NOT_ENDED'});
 f.setClock('2026-10-31T05:00:00Z');f.t.paymentAttempts[0].providerVersion='1.0.0';expect((await f.service.get(buyer,id)).status).toBe('LEGACY_OR_UNFUNDED');await expect(f.service.act(buyer,id,request('DISPUTE',{reason:'Motivo de prueba'}))).rejects.toMatchObject({code:'PROTECTED_PAYMENT_REQUIRED'});
 const scoped=createSettlementService(f.db,undefined,{userIds:[buyer]});await expect(scoped.get(buyer,id)).rejects.toMatchObject({status:404});
});
test('SET-04: rechaza exceso, aceptación sin declaración y resolución sin disputa',async()=>{
 const f=fixture();await expect(f.service.act(seller,id,request('REPORT',{quantityKwh:'10000.01',evidenceReference:'Referencia prueba'}))).rejects.toMatchObject({code:'QUANTITY_EXCEEDS_AGREEMENT'});
 await expect(f.service.act(buyer,id,request('ACCEPT'))).rejects.toMatchObject({code:'INVALID_TRANSITION'});
 await expect(f.service.act(admin,id,request('RESOLVE',{quantityKwh:'0',reason:'Resolución prueba'}))).rejects.toMatchObject({code:'INVALID_TRANSITION'});
});
test('SET-05: decimal exacto, validación cerrada y fin de hora Colombia',()=>{
 expect(settlementAmounts('10.25','980.12345','10046.2653625')).toEqual({sellerAmountCop:'10046.2653625',refundAmountCop:'0.0000000'});
 for(const q of ['-1','NaN','1e3','0.001','01',''])expect(()=>settlementInput(request('REPORT',{quantityKwh:q,evidenceReference:'Acta de prueba'}))).toThrow();
 expect(()=>settlementInput({...request('ACCEPT'),sellerAmountCop:'1'})).toThrow();
 expect(()=>settlementInput(request('DISPUTE',{reason:'corto'}))).toThrow();
 expect(deliveryEnded(new Date('2026-10-30'),0,new Date('2026-10-30T05:59:59Z'))).toBe(false);
 expect(deliveryEnded(new Date('2026-10-30'),0,new Date('2026-10-30T06:00:00Z'))).toBe(true);
 expect(deliveryEnded(new Date('2026-10-30'),null,new Date('2026-10-31T05:00:00Z'))).toBe(true);
});
test('SET-HTTP: origen y autenticación preceden acciones; contrato seguro y JSON inválido',async()=>{
 const f=fixture(),app=express();app.use('/settlements',createSettlementRouter(f.service,(req,res,next)=>{const who=req.get('X-Test-Actor');if(!who){res.sendStatus(401);return;}req.authUser={id:who} as any;next()}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const addr=server.address();if(!addr||typeof addr==='string')throw Error();const base=`http://127.0.0.1:${addr.port}/settlements`;
 try{
  expect((await fetch(base+'/'+id)).status).toBe(401);
  expect((await fetch(base+'/'+id,{method:'POST',headers:{'X-Test-Actor':seller,'Origin':'https://attacker.invalid','Content-Type':'application/json'},body:JSON.stringify(request('REPORT',{quantityKwh:'0',evidenceReference:'Acta de prueba'}))})).status).toBe(403);
  expect((await fetch(base+'/'+id,{method:'POST',headers:{'X-Test-Actor':seller,'Content-Type':'application/json'},body:'{'})).status).toBe(400);
  const body:any=await(await fetch(base+'/'+id,{headers:{'X-Test-Actor':buyer}})).json();expect(body.status).toBe('HELD');expect(body).not.toHaveProperty('buyerUserId');
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
