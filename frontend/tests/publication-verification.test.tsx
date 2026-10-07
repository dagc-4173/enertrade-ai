import { expect,test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { PublicationVerificationAction, SimulationProfileEditor } from '../src/components/PublicationVerification'
import { isPublicationVerification } from '../src/services/publicationVerificationService'
const verification={id:'v',status:'APPROVED' as const,reason:'Cumple el límite declarado.',maxQuantityKwh:'10.25',profileVersion:1,ruleId:'declared-hourly-capacity',ruleVersion:'1.0.0',createdAt:'2026-10-07T03:00:00Z',source:'USER_DECLARED_SIMULATION'}
test('VERIFY-UI-01: identifica aprobación simulada, límite y versión sin ejecutar al renderizar',()=>{
 const html=renderToStaticMarkup(<PublicationVerificationAction kind="offer" publication={{id:'o',quantityKwh:10.25,hour:8,verification}} onChanged={()=>{throw new Error('No ejecutar')}}/> )
 expect(html).toContain('Verificada en simulación');expect(html).toContain('10,25 kWh');expect(html).toContain('Solo una verificación aprobada y vigente habilita')
})
test('VERIFY-UI-02: histórico sin hora conserva estado desconocido y botón deshabilitado',()=>{
 const html=renderToStaticMarkup(<PublicationVerificationAction kind="offer" publication={{id:'o',quantityKwh:10,hour:null}} onChanged={()=>{}}/> )
 expect(html).toContain('Sin verificar');expect(html).toContain('disabled=""')
})
test('VERIFY-UI-03: perfil inicia sin configurar y no inventa límites',()=>{
 const html=renderToStaticMarkup(<SimulationProfileEditor kind="offer"/> )
 expect(html).toContain('sin configurar');expect(html).toContain('No acreditan disponibilidad física');expect((html.match(/value=""/g)??[]).length).toBe(24)
})
test('VERIFY-UI-04: parser rechaza orígenes y estados desconocidos',()=>{
 expect(isPublicationVerification(verification)).toBe(true)
 expect(isPublicationVerification({...verification,status:'REAL_ENERGY_APPROVED'})).toBe(false)
 expect(isPublicationVerification({...verification,source:'SENSOR'})).toBe(false)
})
