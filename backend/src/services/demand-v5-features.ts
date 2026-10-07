import { buildV5Features } from '@/experiments/hu06-demand-v5-preregistration';
import type { DemandRecord } from '@/experiments/hu06-multihorizon';

export function buildRuntimeDemandV5Features(records: DemandRecord[], origin: string, targetDate: string, horizonDays: number) {
  return buildV5Features(records, origin, targetDate, horizonDays);
}

export function demandV5CalendarDate(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}