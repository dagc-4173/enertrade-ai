import { useEffect, useState } from 'react'
import { LocalizedDecimalInput } from './forms/LocalizedDecimalInput'
import { getCapacityProfile, saveCapacityProfile, verifyPublication, type CapacityProfile, type PublicationVerification, type VerificationKind } from '../services/publicationVerificationService'
import { formatLocalizedDecimal, parseLocalizedDecimal } from '../utils/localizedDecimal'
import { errorMessage } from '../utils/marketplaceActions'
import { hourLabel } from '../utils/hourlyMarket'
import { formatEnergyKWh } from '../utils/numberFormat'

export function SimulationProfileEditor({ kind, onChanged }: {kind:VerificationKind;onChanged?:()=>void}) {
 const [profile,setProfile]=useState<CapacityProfile|null>(null)
 const [limits,setLimits]=useState<Record<number,string>>({})
 const [busy,setBusy]=useState(false)
 const [ready,setReady]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 useEffect(()=>{ const controller=new AbortController(); getCapacityProfile(kind,controller.signal).then(value=>{if(!controller.signal.aborted){setProfile(value);setLimits(Object.fromEntries((value?.limits??[]).map(limit=>[limit.hour,formatLocalizedDecimal(limit.maxQuantityKwh,'quantity')])));setReady(true)}}).catch(reason=>{if(!controller.signal.aborted)setError(errorMessage(reason))});return()=>controller.abort()},[kind])
 async function save(){
  const rows=Object.entries(limits).filter(([,value])=>value.trim()).map(([hour,value])=>({hour:Number(hour),maxQuantityKwh:parseLocalizedDecimal(value,'quantity').canonicalValue}))
  if(!rows.length || rows.some(row=>row.maxQuantityKwh===null)){setError('Completa al menos un límite no negativo con máximo dos decimales.');return}
  setBusy(true);setError('');setNotice('')
  try{const saved=await saveCapacityProfile(kind,rows as {hour:number;maxQuantityKwh:string}[]);setProfile(saved);onChanged?.();setNotice(`Perfil de simulación guardado, versión ${saved.version}.`)}catch(reason){setError(errorMessage(reason))}finally{setBusy(false)}
 }
 return <details className="simulation-profile"><summary>Perfil de simulación de {kind==='offer'?'oferta':'demanda'} · {profile?`versión ${profile.version}`:'sin configurar'}</summary>
  <p>Define límites ficticios en kWh por hora para comprobar tus publicaciones. Aplican a cada día publicado. No acreditan disponibilidad física. Deja en blanco las horas sin referencia; cero indica capacidad simulada nula.</p>
  <div className="table-wrap"><table className="data-table"><thead><tr><th>Hora</th><th>Límite de capacidad (kWh)</th></tr></thead><tbody>{Array.from({length:24},(_,hour)=><tr key={hour}><td>{hourLabel(hour)}</td><td><LocalizedDecimalInput aria-label={`Límite simulado ${kind} ${hourLabel(hour)}`} mode="quantity" value={limits[hour]??''} onValueChange={value=>setLimits(current=>({...current,[hour]:value.displayValue}))} disabled={busy||!ready}/></td></tr>)}</tbody></table></div>
  <button type="button" className="secondary-button" disabled={busy||!ready} onClick={()=>{void save()}}>{busy?'Guardando…':'Guardar nueva versión del perfil'}</button>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </details>
}
const labels:Record<PublicationVerification['status'],string>={APPROVED:'Verificada en simulación',REJECTED:'Supera el límite de capacidad',NO_REFERENCE:'Sin referencia simulada',OUTDATED:'Verificación desactualizada'}
export function PublicationVerificationAction({kind,publication,onChanged}:{kind:VerificationKind;publication:{id:string;quantityKwh:number;hour?:number|null;verification?:PublicationVerification|null};onChanged:()=>void}){
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [result,setResult]=useState<{quantity:number;value:PublicationVerification}>()
 const current=publication.verification?.id===result?.value.id ? publication.verification : result?.quantity===publication.quantityKwh ? result.value : publication.verification
 async function verify(){setBusy(true);setError('');try{setResult({quantity:publication.quantityKwh,value:await verifyPublication(kind,publication.id)});onChanged()}catch(reason){setError(errorMessage(reason))}finally{setBusy(false)}}
 return <div className="publication-verification"><strong>{current?labels[current.status]:'Sin verificar'}</strong>{current&&<details><summary>Detalle de verificación</summary><p>{current.reason}</p>{current.maxQuantityKwh!==null&&<p>Límite de capacidad: {formatEnergyKWh(Number(current.maxQuantityKwh))}</p>}<p>Perfil: {current.profileVersion??'sin referencia'} · Regla: {current.ruleId} {current.ruleVersion}</p><p>{new Date(current.createdAt).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</p><p>Solo una verificación aprobada y vigente habilita la publicación para transar.</p></details>}<button type="button" className="secondary-button" disabled={busy||publication.hour==null} onClick={()=>{void verify()}}>{busy?'Verificando…':'Verificar en simulación'}</button>{error&&<p role="alert">{error}</p>}</div>
}
