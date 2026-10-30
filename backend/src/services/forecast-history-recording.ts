import type { Request } from 'express';
import { forecastHistoryService } from './forecast-history.service';
// Called with the server's result, before replying; clients cannot upload a fabricated forecast.
export async function withForecastHistory(req: Pick<Request,'authUser'|'requestId'>, result: unknown, service = forecastHistoryService) {
  if (!req.authUser || !req.requestId || !result || typeof result !== 'object' || Array.isArray(result)) return result;
  try { return { ...result, history: await service.record(req.authUser.id,req.requestId,result) }; }
  catch { return { ...result, history: { status: 'failed', id: null } }; }
}
