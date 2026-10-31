import process from 'node:process'
process.env.VITE_API_BASE_URL='http://enertrade.test'
import {test,expect,afterEach,spyOn} from 'bun:test'
import {renderToStaticMarkup} from 'react-dom/server'
import {SettlementPanel,SettlementSummary} from '../src/components/SettlementPanel'
import {isSettlement,actSettlement,type Settlement} from '../src/services/settlementService'
const data:Settlement={transactionId:'tx',simulated:true,status:'HELD',quantityKwh:'10000',pricePerKwh:'500',reservedAmountCop:'5000000',deliveryEnded:true,declaredKwh:null,acceptedKwh:null,sellerAmountCop:null,refundAmountCop:null,evidenceReference:null,disputeReason:null,resolutionReason:null,events:[]}
const original=globalThis.fetch;afterEach(()=>{globalThis.fetch=original})
test('SET-UI-01: proveedor declara y comprador disputa sin liberar unilateralmente',()=>{
 const seller=renderToStaticMarkup(<SettlementPanel id="tx" role="SELLER" initial={data}/>);expect(seller).toContain('Registrar entrega simulada');expect(seller).not.toContain('Aceptar entrega y liquidar');
 const buyer=renderToStaticMarkup(<SettlementPanel id="tx" role="BUYER" initial={data}/>);expect(buyer).toContain('Abrir disputa y mantener retención');expect(buyer).not.toContain('Registrar entrega simulada');
});
test('SET-UI-02: liquidación parcial muestra pago, devolución y datos aceptados',()=>{
 const html=renderToStaticMarkup(<SettlementSummary data={{...data,status:'SETTLED',acceptedKwh:'8000',sellerAmountCop:'4000000',refundAmountCop:'1000000'}}/>);expect(html).toContain('Liquidado');expect(html).toContain('Devolución simulada al comprador');expect(html).toContain('4.000.000');expect(html).toContain('1.000.000');
});
test('SET-UI-03: no resuelve comprador; admin requiere disputa; mantiene referencia como texto',()=>{
 const s={...data,status:'DISPUTED' as const,evidenceReference:'<script>alert(1)</script>'};
 const buyer=renderToStaticMarkup(<SettlementPanel id="tx" role="BUYER" initial={s}/>);expect(buyer).not.toContain('Resolver disputa y liquidar');expect(buyer).toContain('&lt;script&gt;');
 const admin=renderToStaticMarkup(<SettlementPanel id="tx" role="ADMIN" initial={s}/>);expect(admin).toContain('Resolver disputa y liquidar');
 expect(renderToStaticMarkup(<SettlementPanel id="tx" role="ADMIN" initial={{...data,status:'SETTLED',acceptedKwh:'0',sellerAmountCop:'0',refundAmountCop:'5000000'}}/>)).not.toContain('Resolver disputa y liquidar');
});
test('SET-UI-04: contrato rechaza falsa custodia y liquidación sin importes',()=>{expect(isSettlement(data)).toBe(true);expect(isSettlement({...data,simulated:false})).toBe(false);expect(isSettlement({...data,status:'SETTLED'})).toBe(false);expect(isSettlement({...data,declaredKwh:'-1'})).toBe(false)});
test('SET-UI-05: envía cookies y datos de acción sin importar cálculo monetario',async()=>{
 const f=spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify(data),{status:200}));await actSettlement('tx',{action:'ACCEPT',requestKey:'key'});expect(f.mock.calls[0]?.[1]?.credentials).toBe('include');expect(JSON.parse(String(f.mock.calls[0]?.[1]?.body))).toEqual({action:'ACCEPT',requestKey:'key'});
});
