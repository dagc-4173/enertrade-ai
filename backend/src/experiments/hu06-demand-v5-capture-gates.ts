import { buildV5Features } from './hu06-demand-v5-preregistration';
import type { DemandRecord } from './hu06-multihorizon';
import { calendarDate } from '@/services/forecast.contract';

export type V5SourceWindow = {
  id: number; status: string; requestedFrom: Date; requestedTo: Date; fetchedAt: Date | null;
  energyDatasetId: number | null; contentHash: string | null;
};

export function v5LocalDate(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function resolveV5SourceAcquisitions(sourceDates: string[], windows: V5SourceWindow[], generatedAt: string) {
  const acquisitions: { date: string; fetchedAt: string; sourceDatasetId: number }[] = [];
  const generatedTime = Date.parse(generatedAt);
  if (!Number.isFinite(generatedTime)) return { valid: false as const, reason: 'GENERATED_AT_INVALID', acquisitions };
  for (const date of [...new Set(sourceDates)].sort()) {
    const matching = windows.filter(row => row.requestedFrom.toISOString().slice(0, 10) <= date && row.requestedTo.toISOString().slice(0, 10) >= date);
    if (matching.length === 0) return { valid: false as const, reason: 'SOURCE_PROVENANCE_MISSING', acquisitions };
    if (matching.length !== 1) return { valid: false as const, reason: 'SOURCE_PROVENANCE_AMBIGUOUS', acquisitions };
    const row = matching[0]!;
    if (row.status !== 'completed' || !row.fetchedAt || !Number.isFinite(row.fetchedAt.getTime()) || !Number.isSafeInteger(row.energyDatasetId) || row.energyDatasetId! <= 0 || !row.contentHash) {
      return { valid: false as const, reason: 'SOURCE_PROVENANCE_INVALID', acquisitions };
    }
    if (row.fetchedAt.getTime() > generatedTime) return { valid: false as const, reason: 'SOURCE_FETCHED_AFTER_GENERATION', acquisitions };
    acquisitions.push({ date, fetchedAt: row.fetchedAt.toISOString(), sourceDatasetId: row.energyDatasetId! });
  }
  return { valid: true as const, reason: null, acquisitions };
}

export function findLatestV5ClosedOrigin(records: DemandRecord[], now: Date) {
  const localDate = v5LocalDate(now);
  for (const origin of [...new Set(records.map(row => row.fecha_xm))].filter(date => date < localDate).sort().reverse()) {
    const target = new Date(`${origin}T00:00:00Z`); target.setUTCDate(target.getUTCDate() + 1);
    if (buildV5Features(records, origin, target.toISOString().slice(0, 10), 1)) return origin;
  }
  return null;
}

export function v5TargetGate(input: { targetDate: string; now: Date; latestReceivedDate: string; acquiredAt: Date | null; cutoff: string }) {
  if (!calendarDate(input.targetDate)) throw new Error('V5_TARGET_DATE_INVALID');
  const targetKnown = input.targetDate <= input.latestReceivedDate || input.acquiredAt !== null;
  const targetFuture = input.targetDate > v5LocalDate(input.now);
  const reason = targetKnown ? input.acquiredAt && input.acquiredAt.toISOString() <= input.cutoff ? 'TARGET_KNOWN_AT_CUTOFF' : 'TARGET_ALREADY_RECEIVED'
    : !targetFuture ? 'TARGET_NOT_FUTURE' : null;
  return { targetKnown, targetFuture, reason };
}

export function assertV5ScoringAcquisition(entry: { targetDate: string; generatedAt: string; preregistrationCutoff: string }, observed: { targetDate: string; fetchedAt: string }) {
  const fetched = Date.parse(observed.fetchedAt), generated = Date.parse(entry.generatedAt), cutoff = Date.parse(entry.preregistrationCutoff);
  if (observed.targetDate !== entry.targetDate || ![fetched, generated, cutoff].every(Number.isFinite) || fetched <= cutoff || fetched <= generated) throw new Error('V5_TARGET_ACQUISITION_NOT_PROSPECTIVE');
  return true;
}