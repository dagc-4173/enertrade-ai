import {expect,test} from 'bun:test'
import {renderToStaticMarkup} from 'react-dom/server'
import {HourlyMarket} from '../src/components/HourlyMarket'
import {PublicationStatus,PublicationActions} from '../src/pages/Marketplace'
import {publicationFilters,filteredPublications} from '../src/utils/marketplaceSync'
import type {EnergyDemandDto} from '../src/types/marketplace'
const demand:EnergyDemandDto={id:'d',publicationId:'dp',hour:8,quantityKwh:10,availableQuantityKwh:10,confirmedQuantityKwh:0,reservedQuantityKwh:0,maxPricePerKwh:1000,deliveryDate:'2026-10-08',status:'BLOCKED',createdAt:'2026-10-07',updatedAt:'2026-10-07'}
test('GATE-UI-01: selección preexistente no permite proponer si la publicación propia queda inactiva',()=>{
 const html=renderToStaticMarkup(<HourlyMarket offers={[{id:'o',publicationId:'op',hour:8,availableQuantityKwh:'10',pricePerKwh:'900',deliveryDate:'2026-10-08',status:'ACTIVE'}]} demands={[]} ownOffers={[]} ownDemands={[demand]} initialSelection={{kind:'offer',publicationId:'op',ownPublicationId:'dp',term:{externalId:'o',ownId:'d',hour:8,quantity:'10',price:'900'}}} onRefresh={()=>{}} />)
 expect(html).toContain('La selección ya no está habilitada')
 expect(html).toMatch(/disabled="">Proponer horas seleccionadas/)
})
test('GATE-UI-02: estado inactivo es visible y permite corrección, sin confundirse con cancelación',()=>{
 expect(renderToStaticMarkup(<PublicationStatus status="BLOCKED"/>)).toContain('Inactiva')
 const actions=renderToStaticMarkup(<PublicationActions type="demand" publication={demand} onChanged={()=>{}}/>)
 expect(actions).toContain('Editar');expect(actions).toContain('Cancelar')
 expect(publicationFilters.some(row=>row.value==='BLOCKED')).toBe(true)
 expect(filteredPublications([demand],'BLOCKED')).toHaveLength(1)
})
