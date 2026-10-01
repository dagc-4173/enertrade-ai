import { appendFileSync, closeSync, existsSync, fsyncSync, openSync, readFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { addDays } from './hu06-multihorizon';
import { buildV5Features, v5OrderedFeatures } from './hu06-demand-v5-preregistration';
import type { DemandRecord } from './hu06-multihorizon';

export const v5PreregistrationCutoff = '2026-10-01T19:02:43.949Z';
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const bogotaDate = (value: string) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
type Acquisition = { date: string; fetchedAt: string; sourceDatasetId: number };
type Candidate = {
  generatedAt: string; preregistrationCutoff: string; modelId: string; modelVersion: string;
  forecastOriginDate: string; targetDate: string; horizonDays: number;
  prediction: { demanda_kwh: number }; orderedFeatures: readonly string[]; featureSourceDates: string[];
  actualSourceDates: string[]; oldestDate: string; newestDate: string; count: 28; calendarSpanDays: number;
  featureSnapshotHash: string; sourceAcquisitions: Acquisition[];
};
export type V5ProspectiveEntry = Candidate & { previousEntryHash: string | null; entryHash: string };

export function prepareV5ProspectivePrediction(input: {
  records: DemandRecord[]; origin: string; targetDate: string; horizonDays: number;
  modelId: string; modelVersion: string; prediction: number; generatedAt: string;
  targetUnknownAtCutoff: boolean; targetUnknownAtGeneration: boolean; sourceAcquisitions: Acquisition[];
}): Candidate {
  const built = buildV5Features(input.records, input.origin, input.targetDate, input.horizonDays);
  if (!built) throw new Error('V5_SOURCE_UNAVAILABLE');
  if (!input.targetUnknownAtCutoff || !input.targetUnknownAtGeneration || !Number.isFinite(input.prediction) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.generatedAt) ||
      input.generatedAt <= v5PreregistrationCutoff || input.origin >= bogotaDate(input.generatedAt) ||
      input.targetDate <= bogotaDate(input.generatedAt) ||
      input.targetDate !== addDays(input.origin, input.horizonDays) ||
      input.modelId !== `xm-demandasin-ridge-direct-h${input.horizonDays}-v5` ||
      !/^hu06-demand-v5-c-primary@\d+\.\d+\.\d+$/.test(input.modelVersion)) throw new Error('V5_PROSPECTIVE_NOT_VERIFIED');
  const sourceDates = [...new Set(built.featureDates)].sort();
  const acquisitions = [...input.sourceAcquisitions].sort((left, right) => left.date.localeCompare(right.date));
  if (acquisitions.length !== sourceDates.length || acquisitions.some((row, index) => row.date !== sourceDates[index] ||
      !Number.isSafeInteger(row.sourceDatasetId) || row.sourceDatasetId <= 0 ||
      !Number.isFinite(Date.parse(row.fetchedAt)) || row.fetchedAt > input.generatedAt || row.date > input.origin)) throw new Error('V5_SOURCE_ACQUISITION_NOT_VERIFIED');
  const featureSnapshotHash = sha256(JSON.stringify({ modelId: input.modelId, modelVersion: input.modelVersion,
    origin: input.origin, targetDate: input.targetDate, horizonDays: input.horizonDays, orderedFeatures: v5OrderedFeatures,
    values: built.values, sourceDates, actualSourceDates: built.actualSourceDates, calendarSpanDays: built.calendarSpanDays, acquisitions }));
  return { generatedAt: input.generatedAt, preregistrationCutoff: v5PreregistrationCutoff, modelId: input.modelId, modelVersion: input.modelVersion,
    forecastOriginDate: input.origin, targetDate: input.targetDate, horizonDays: input.horizonDays,
    prediction: { demanda_kwh: input.prediction }, orderedFeatures: v5OrderedFeatures, featureSourceDates: sourceDates,
    actualSourceDates: built.actualSourceDates, oldestDate: built.oldestDate, newestDate: built.newestDate,
    count: built.count, calendarSpanDays: built.calendarSpanDays, featureSnapshotHash, sourceAcquisitions: acquisitions };
}

export function verifyV5ProspectiveJournal(path: string): V5ProspectiveEntry[] {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf8');
  if (!text) return [];
  if (!text.endsWith('\n')) throw new Error('V5_JOURNAL_INCOMPLETE');
  const entries: V5ProspectiveEntry[] = []; let previous: string | null = null;
  for (const line of text.slice(0, -1).split('\n')) {
    let entry: V5ProspectiveEntry;
    try { entry = JSON.parse(line) as V5ProspectiveEntry; } catch { throw new Error('V5_JOURNAL_INVALID'); }
    const { entryHash, ...payload } = entry;
    if (entry.previousEntryHash !== previous || typeof entryHash !== 'string' || !/^[a-f0-9]{64}$/.test(entryHash) ||
        entryHash !== sha256(JSON.stringify(payload)) || entry.preregistrationCutoff !== v5PreregistrationCutoff ||
        !Number.isFinite(entry.prediction?.demanda_kwh) || entry.generatedAt <= v5PreregistrationCutoff ||
        entry.forecastOriginDate >= bogotaDate(entry.generatedAt) || entry.targetDate <= bogotaDate(entry.generatedAt) ||
        entry.targetDate !== addDays(entry.forecastOriginDate, entry.horizonDays) ||
        !Array.isArray(entry.actualSourceDates) || entry.actualSourceDates.length !== 28 || entry.count !== 28 ||
        entry.oldestDate !== entry.actualSourceDates[0] || entry.newestDate !== entry.actualSourceDates.at(-1) ||
        entry.calendarSpanDays > 42 || entry.featureSourceDates.some(date => date > entry.forecastOriginDate)) throw new Error('V5_JOURNAL_INVALID');
    entries.push(entry); previous = entryHash;
  }
  return entries;
}

export function appendV5ProspectivePrediction(path: string, input: Candidate): V5ProspectiveEntry {
  const lockPath = `${path}.lock`; let lock: number;
  try { lock = openSync(lockPath, 'wx'); } catch { throw new Error('V5_JOURNAL_LOCKED'); }
  try {
    const entries = verifyV5ProspectiveJournal(path);
    if (entries.some(entry => entry.modelVersion === input.modelVersion && entry.forecastOriginDate === input.forecastOriginDate &&
        entry.targetDate === input.targetDate && entry.horizonDays === input.horizonDays)) throw new Error('DUPLICATE_V5_PROSPECTIVE_PREDICTION');
    const payload = { ...input, previousEntryHash: entries.at(-1)?.entryHash ?? null };
    const entry = { ...payload, entryHash: sha256(JSON.stringify(payload)) };
    const output = openSync(path, 'a');
    try { appendFileSync(output, `${JSON.stringify(entry)}\n`, 'utf8'); fsyncSync(output); } finally { closeSync(output); }
    return entry;
  } finally { closeSync(lock); unlinkSync(lockPath); }
}