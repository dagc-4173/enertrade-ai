import { useEffect, useState, useRef } from 'react';
import { getSettlement, actSettlement, getDisputes, type Settlement } from '../services/settlementService';
import { errorMessage } from '../utils/marketplaceActions';
import { formatCurrencyCOP, formatEnergyKWh } from '../utils/numberFormat';
import { LocalizedDecimalInput } from './forms/LocalizedDecimalInput';
import './SettlementPanel.css';
const labels = { HELD: 'Importe retenido', REVIEW: 'Entrega en revisión', DISPUTED: 'En disputa', SETTLED: 'Liquidado', LEGACY_OR_UNFUNDED: 'Sin retención nueva' };
export function SettlementSummary({ data }: {
    data: Settlement;
}) { return <><p><strong>{labels[data.status]} · simulación</strong></p><dl className="settlement-summary"><div><dt>Importe reservado del acuerdo</dt><dd>{formatCurrencyCOP(Number(data.reservedAmountCop))}</dd></div><div><dt>Energía acordada</dt><dd>{formatEnergyKWh(Number(data.quantityKwh))}</dd></div>{data.declaredKwh !== null && <div><dt>Entrega declarada</dt><dd>{formatEnergyKWh(Number(data.declaredKwh))}</dd></div>}{data.acceptedKwh !== null && <div><dt>Entrega aceptada</dt><dd>{formatEnergyKWh(Number(data.acceptedKwh))}</dd></div>}{data.status === 'SETTLED' && <><div><dt>Pago simulado al proveedor</dt><dd>{formatCurrencyCOP(Number(data.sellerAmountCop))}</dd></div><div><dt>Devolución simulada al comprador</dt><dd>{formatCurrencyCOP(Number(data.refundAmountCop))}</dd></div></>}</dl>{data.evidenceReference && <p>Referencia declarada: {data.evidenceReference}</p>}{data.disputeReason && <p>Motivo de disputa: {data.disputeReason}</p>}{data.resolutionReason && <p>Resolución: {data.resolutionReason}</p>}</>; }
export function SettlementPanel({ id, role, initial }: {
    id: string;
    role: 'BUYER' | 'SELLER' | 'ADMIN';
    initial?: Settlement;
}) {
    const [data, setData] = useState<Settlement | null>(initial ?? null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
    const [quantity, setQuantity] = useState(''), [display, setDisplay] = useState(''), [note, setNote] = useState('');
    const intent = useRef<{
        payload: string;
        key: string;
    } | null>(null);
    useEffect(() => { if (initial)
        return; const c = new AbortController(); getSettlement(id, c.signal).then(d => { if (!c.signal.aborted)
        setData(d); }).catch(e => { if (!c.signal.aborted)
        setError(errorMessage(e)); }); return () => c.abort(); }, [id, initial]);
    async function act(action: 'REPORT' | 'ACCEPT' | 'DISPUTE' | 'RESOLVE') {
        if (busy)
            return;
        const input: Record<string, string> = { action, ...(['REPORT', 'RESOLVE'].includes(action) ? { quantityKwh: quantity } : {}), ...(action === 'REPORT' ? { evidenceReference: note } : {}), ...(['DISPUTE', 'RESOLVE'].includes(action) ? { reason: note } : {}) };
        const payload = JSON.stringify(input);
        if (intent.current?.payload !== payload)
            intent.current = { payload, key: crypto.randomUUID() };
        setBusy(true);
        setError('');
        setNotice('');
        try {
            setData(await actSettlement(id, { ...input, requestKey: intent.current.key }));
            intent.current = null;
            setNotice('Operación simulada registrada.');
            window.dispatchEvent(new Event('enertrade:payments-changed'));
        }
        catch (e) {
            setError(errorMessage(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function refresh() { setError(''); setBusy(true); try {
        setData(await getSettlement(id));
    }
    catch (e) {
        setError(errorMessage(e));
    }
    finally {
        setBusy(false);
    } }
    return <section className="settlement-panel" aria-label="Protección del comprador"><h4>Entrega y protección del comprador</h4><p>Retención, entrega y liquidación simuladas. La referencia es declarativa; no verifica medición física ni custodia dinero real.</p>{!data && !error && <p role="status">Consultando entrega…</p>}{data && <><SettlementSummary data={data}/>{data.status === 'LEGACY_OR_UNFUNDED' ? <p>Los pagos históricos conservan su estado. La protección se aplica a nuevos pagos aprobados con retención.</p> : <>{!data.deliveryEnded && <p>Las acciones se habilitan al finalizar el periodo de entrega en Colombia.</p>}{data.status === 'HELD' && role === 'SELLER' && <><label>Energía entregada (kWh)<LocalizedDecimalInput mode="quantity" value={display} onValueChange={v => { setDisplay(v.displayValue); setQuantity(v.canonicalValue ?? ''); }} disabled={busy}/></label><label>Referencia de evidencia (mínimo 8 caracteres)<textarea maxLength={1000} value={note} onChange={e => setNote(e.target.value)} disabled={busy}/></label><button className="primary-button" disabled={busy || !data.deliveryEnded || !quantity || note.trim().length < 8} onClick={() => void act('REPORT')}>Registrar entrega simulada</button></>}{role === 'BUYER' && ['HELD', 'REVIEW'].includes(data.status) && <>{data.status === 'REVIEW' && <><p>Al aceptar, se liquida definitivamente la cantidad declarada. El faltante se devuelve en simulación; no hay penalización adicional.</p><button className="primary-button" disabled={busy || !data.deliveryEnded} onClick={() => { if (window.confirm('¿Aceptar esta cantidad y liquidar definitivamente el pago y la devolución simulados?'))
        void act('ACCEPT'); }}>Aceptar entrega y liquidar</button></>}<label>Motivo de disputa (mínimo 8 caracteres)<textarea maxLength={1000} value={note} onChange={e => setNote(e.target.value)} disabled={busy}/></label><button className="secondary-button" disabled={busy || !data.deliveryEnded || note.trim().length < 8} onClick={() => void act('DISPUTE')}>Abrir disputa y mantener retención</button></>}{role === 'ADMIN' && data.status === 'DISPUTED' && <><p>Resuelve únicamente acuerdos en los que no seas participante. La cantidad aceptada determina el pago y la devolución.</p><label>Cantidad aceptada (kWh)<LocalizedDecimalInput mode="quantity" value={display} onValueChange={v => { setDisplay(v.displayValue); setQuantity(v.canonicalValue ?? ''); }} disabled={busy}/></label><label>Justificación de resolución<textarea value={note} maxLength={1000} onChange={e => setNote(e.target.value)} disabled={busy}/></label><button className="primary-button" disabled={busy || !quantity || note.trim().length < 8} onClick={() => { if (window.confirm('¿Resolver la disputa y liquidar definitivamente en simulación?'))
        void act('RESOLVE'); }}>Resolver disputa y liquidar</button></>}{data.status === 'DISPUTED' && role !== 'ADMIN' && <p>El importe permanece retenido hasta que un administrador ajeno al acuerdo resuelva la disputa.</p>}</>}{data.events.length > 0 && <details><summary>Historial de entrega y liquidación</summary><ol>{data.events.map((e, i) => <li key={i}>{({ REPORT: 'Entrega registrada', ACCEPT: 'Entrega aceptada y liquidada', DISPUTE: 'Disputa abierta', RESOLVE: 'Disputa resuelta y liquidada' } as Record<string, string>)[e.action] ?? e.action} · {({ BUYER: 'Comprador', SELLER: 'Proveedor', ADMIN: 'Administrador' } as Record<string, string>)[e.actorRole] ?? e.actorRole} · {new Date(e.at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</li>)}</ol></details>}</>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}<button className="secondary-button" disabled={busy} onClick={() => void refresh()}>Actualizar entrega</button></section>;
}
export function SettlementDisputes() {
    const [items, setItems] = useState<Settlement[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
    async function load() { setLoading(true); setError(''); try {
        setItems(await getDisputes());
    }
    catch (e) {
        setError(errorMessage(e));
    }
    finally {
        setLoading(false);
    } }
    useEffect(() => { const c = new AbortController(); getDisputes(c.signal).then(d => { if (!c.signal.aborted)
        setItems(d); }).catch(e => { if (!c.signal.aborted)
        setError(errorMessage(e)); }).finally(() => { if (!c.signal.aborted)
        setLoading(false); }); return () => c.abort(); }, []);
    return <section className="panel"><h2>Disputas de entrega simulada</h2><p>Hasta 100 disputas abiertas, comenzando por las más antiguas. Las partes no pueden resolver su propio acuerdo.</p><button className="secondary-button" disabled={loading} onClick={() => void load()}>Actualizar disputas</button>{loading && <p role="status">Consultando disputas…</p>}{error && <p role="alert">{error}</p>}{!loading && !error && items.length === 0 && <p>No hay disputas pendientes.</p>}{items.map(d => <details key={d.transactionId + ':' + d.events.length}><summary>Acuerdo {d.transactionId.slice(0, 8)}</summary><SettlementPanel id={d.transactionId} role="ADMIN" initial={d}/></details>)}</section>;
}
