import type { HistorySaveState } from '../../services/forecastHistoryService'
export function ForecastSavedNotice({ history }: { history?: HistorySaveState }) {
  if (!history) return <p className="section-description">Este resultado no informa registro en el historial. El seguimiento requiere la versión actualizada del servidor.</p>
  if (history.status === 'saved') return <p role="status" className="forecast-insight-note">Pronóstico guardado. Puedes consultarlo y evaluarlo después en Patrones → Seguimiento de pronósticos.</p>
  if (history.status === 'not_registered') return <p role="status">Esta consulta no se registró como pronóstico futuro porque el día objetivo ya comenzó.</p>
  return <p role="alert" className="forecast-insight-note">El pronóstico se calculó, pero no pudo guardarse en el historial. Puedes ver este resultado; no estará disponible para seguimiento posterior.</p>
}
