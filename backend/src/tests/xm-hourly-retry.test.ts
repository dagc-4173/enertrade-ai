import { expect,test } from 'bun:test';
import { requestXmHourly } from '../integrations/xm-hourly-demand-acquisition';

test('XM-RETRY-01: transient HTTP retries same read request and records both outcomes',async()=>{
 const calls: string[]=[];const waits:number[]=[];
 const result=await requestXmHourly('/hourly',{MetricId:'Gene'},async(_url,init)=>{calls.push(String(init.body));return calls.length===1?new Response('',{status:503}):Response.json({Items:[]})},20,async ms=>{waits.push(ms)});
 expect(calls).toHaveLength(2);expect(calls[0]).toBe(calls[1]);expect(waits).toEqual([750]);
 expect(result.attempts).toEqual([{attempt:1,outcome:'EXTERNAL_HTTP_ERROR'},{attempt:2,outcome:'succeeded'}]);
});
test('XM-RETRY-02: permanent HTTP and oversized responses never retry',async()=>{
 for(const response of [()=>new Response('',{status:400}),()=>new Response('x'.repeat(2*1024*1024+1))]){
 let calls=0;await expect(requestXmHourly('/Lists',{},async()=>{calls++;return response()},20,async()=>{})).rejects.toBeDefined();expect(calls).toBe(1);
 }
});
test('XM-RETRY-03: timeout is bounded to two attempts and retains failure',async()=>{
 let calls=0;
 try { await requestXmHourly('/hourly',{},async(_url,init)=>{calls++;return new Promise((_resolve,reject)=>init.signal!.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}))},5,async()=>{});throw Error('Expected timeout') }
 catch(error){expect(error).toMatchObject({code:'EXTERNAL_TIMEOUT',attempts:[{attempt:1,outcome:'EXTERNAL_TIMEOUT'},{attempt:2,outcome:'EXTERNAL_TIMEOUT'}]});expect(calls).toBe(2)}
});
