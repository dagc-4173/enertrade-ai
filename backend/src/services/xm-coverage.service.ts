import { prisma } from '@/lib/prisma';
import type { XmMetric } from '@/integrations/xm-window-ingestion.service';

export type XmCoverage = { historicalFrom: string; persistedUntil: string };

export function localCalendarDate(now = new Date()) {
  const year = now.getFullYear(); const month = String(now.getMonth() + 1).padStart(2, '0'); const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calendarNextDate(value: string) {
  const current = new Date(`${value}T00:00:00Z`);
  current.setUTCDate(current.getUTCDate() + 1);
  return current.toISOString().slice(0, 10);
}

function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function calendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function coverageFromConsolidated(metric: XmMetric, rows: { energyDataset: { content: unknown } }[]): XmCoverage | null {
  const dates: string[] = [];
  for (const row of rows) {
    if (!object(row.energyDataset.content) || !Array.isArray(row.energyDataset.content.records)) throw new Error(`Invalid ${metric} consolidated content.`);
    for (const record of row.energyDataset.content.records) {
      if (!object(record) || !calendarDate(record.fecha_xm)) throw new Error(`Invalid ${metric} consolidated date.`);
      dates.push(record.fecha_xm);
    }
  }
  if (dates.length === 0) return null;
  dates.sort();
  return { historicalFrom: dates[0]!, persistedUntil: dates.at(-1)! };
}

export async function readXmCoverage(metric: XmMetric): Promise<XmCoverage | null> {
  const rows = await prisma.xmConsolidatedDataset.findMany({ where: { metric }, select: { energyDataset: { select: { content: true } } } });
  return coverageFromConsolidated(metric, rows as { energyDataset: { content: unknown } }[]);
}