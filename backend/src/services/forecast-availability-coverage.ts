import { prisma } from '@/lib/prisma';
import type { XmMetric } from '@/integrations/xm-window-ingestion.service';
import { coverageFromConsolidated, type XmCoverage } from './xm-coverage.service';

export type CoverageProjection = {
  historicalFrom: string | null; latestReceivedDate: string | null;
  invalidContent: boolean; invalidDate: boolean; observations: unknown;
};
export type CoverageQuery = (sql: string, metric: XmMetric) => Promise<CoverageProjection[]>;
export class ForecastCoverageError extends Error {
  readonly code = 'XM_COVERAGE_CONFLICT';
  constructor() { super('La cobertura consolidada de Demanda contiene valores incompatibles para una misma fecha.'); }
}

// Project in PostgreSQL: overlapping JSON artifacts never cross the DB boundary.
export const availabilityCoverageSql = `
WITH contents AS (
  SELECT e.content
  FROM "XmConsolidatedDataset" c JOIN "EnergyDataset" e ON e.id = c."energyDatasetId"
  WHERE c.metric = $1
), records AS (
  SELECT r.value AS record
  FROM contents CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(content->'records') = 'array' THEN content->'records' ELSE '[]'::jsonb END
  ) r
), dates AS (
  SELECT CASE WHEN $1 = 'DemaSIN' THEN record ELSE NULL END AS record, record->>'fecha_xm' AS day,
    CASE WHEN jsonb_typeof(record) = 'object'
      AND jsonb_typeof(record->'fecha_xm') = 'string'
      AND record->>'fecha_xm' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    THEN substring(record->>'fecha_xm', 6, 2)::int BETWEEN 1 AND 12
      AND substring(record->>'fecha_xm', 9, 2)::int BETWEEN 1 AND
        CASE substring(record->>'fecha_xm', 6, 2)::int
          WHEN 2 THEN CASE WHEN substring(record->>'fecha_xm', 1, 4)::int % 400 = 0
            OR (substring(record->>'fecha_xm', 1, 4)::int % 4 = 0 AND substring(record->>'fecha_xm', 1, 4)::int % 100 <> 0)
            THEN 29 ELSE 28 END
          WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30 ELSE 31 END
    ELSE false END AS valid
  FROM records
)
SELECT min(day) AS "historicalFrom",
  max(day) AS "latestReceivedDate",
  EXISTS(SELECT 1 FROM contents WHERE jsonb_typeof(content) IS DISTINCT FROM 'object'
    OR jsonb_typeof(content->'records') IS DISTINCT FROM 'array') AS "invalidContent",
  coalesce(bool_or(NOT valid), false) AS "invalidDate",
  CASE WHEN $1 = 'DemaSIN' THEN (
    SELECT coalesce(jsonb_agg(observation ORDER BY observation->>'fecha_xm'), '[]'::jsonb)
    FROM (SELECT DISTINCT (
      SELECT jsonb_object_agg(key, value) FROM jsonb_each(CASE WHEN valid THEN record ELSE '{}'::jsonb END)
      WHERE key IN ('fecha_xm', 'demanda_kwh')
    ) AS observation FROM dates WHERE valid) projected
  ) ELSE NULL END AS observations
FROM dates
`;

export function createAvailabilityCoverageReader(query: CoverageQuery) {
  return async (metric: XmMetric): Promise<XmCoverage | null> => {
    const rows = await query(availabilityCoverageSql, metric);
    const row = rows[0];
    if (rows.length !== 1 || !row || row.invalidContent || row.invalidDate) {
      throw new Error(`Invalid ${metric} consolidated coverage projection.`);
    }
    if (row.historicalFrom === null || row.latestReceivedDate === null) return null;
    if (metric === 'DemaSIN') {
      if (!Array.isArray(row.observations)) throw new Error('Invalid DemaSIN coverage observations.');
      const values = new Map<unknown, unknown>();
      for (const observation of row.observations) {
        if (observation === null || typeof observation !== 'object' || Array.isArray(observation)) throw new Error('Invalid DemaSIN coverage observation.');
        const record = observation as Record<string, unknown>;
        if (values.has(record.fecha_xm) && values.get(record.fecha_xm) !== record.demanda_kwh) throw new ForecastCoverageError();
        values.set(record.fecha_xm, record.demanda_kwh);
      }
      return coverageFromConsolidated(metric, [{ energyDataset: { content: { records: row.observations } } }]);
    }
    return { historicalFrom: row.historicalFrom, persistedUntil: row.latestReceivedDate,
      latestReceivedDate: row.latestReceivedDate, latestIndividuallyUsableDate: row.latestReceivedDate, semanticExcludedDates: [] };
  };
}

export const readAvailabilityCoverage = createAvailabilityCoverageReader(
  (sql, metric) => prisma.$queryRawUnsafe<CoverageProjection[]>(sql, metric),
);
