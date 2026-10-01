import { appendFileSync, closeSync, existsSync, fsyncSync, openSync, readFileSync, unlinkSync } from 'node:fs';
import { addDays, createProspectivePrediction, preregistrationVersion, sha256, type FrozenV4Model, type PriceGeneRecord } from './hu08-price-v4-preregistration';

export type SourceCoverage = {
  priceUntil: string; geneUntil: string; priceFetchedAt: string; geneFetchedAt: string;
  priceWindowId: number; geneWindowId: number; priceConsolidatedId: number; geneConsolidatedId: number;
  priceEnergyDatasetId: number; geneEnergyDatasetId: number;
  priceWindowHash: string; geneWindowHash: string; priceContentHash: string; geneContentHash: string;
};
export type ProspectiveEntry = ReturnType<typeof createProspectivePrediction> & {
  preregistrationCommit: string; preregistrationTag: string; sourceIds: Pick<SourceCoverage, 'priceWindowId' | 'geneWindowId' | 'priceConsolidatedId' | 'geneConsolidatedId' | 'priceEnergyDatasetId' | 'geneEnergyDatasetId' | 'priceWindowHash' | 'geneWindowHash' | 'priceContentHash' | 'geneContentHash'>;
  previousEntryHash: string | null; entryHash: string;
};
export type Gate = { status: 'ready'; origin: string; coverage: SourceCoverage } | { status: 'unavailable'; reason: string };
const calendar = (value: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

export function assessOrigin(input: { cutoff: string; now: Date; coverage: SourceCoverage; priceComplete: boolean; geneComplete: boolean }): Gate {
  const { coverage, cutoff, now } = input;
  if (!input.priceComplete || !input.geneComplete) return { status: 'unavailable', reason: 'SOURCE_INCOMPLETE_24_PERIODS' };
  if (coverage.priceUntil !== coverage.geneUntil) return { status: 'unavailable', reason: 'SOURCE_COVERAGE_NOT_ALIGNED' };
  if (coverage.priceFetchedAt <= cutoff || coverage.geneFetchedAt <= cutoff) return { status: 'unavailable', reason: 'SOURCE_NOT_FETCHED_AFTER_PREREGISTRATION' };
  if (coverage.priceFetchedAt > now.toISOString() || coverage.geneFetchedAt > now.toISOString()) return { status: 'unavailable', reason: 'SOURCE_FETCHED_IN_FUTURE' };
  if (coverage.priceUntil < cutoff.slice(0, 10)) return { status: 'unavailable', reason: 'ORIGIN_BEFORE_PREREGISTRATION' };
  if (coverage.priceUntil >= calendar(now)) return { status: 'unavailable', reason: 'ORIGIN_DAY_NOT_CLOSED' };
  return { status: 'ready', origin: coverage.priceUntil, coverage };
}

export function parseAndVerifyRegistry(path: string): ProspectiveEntry[] {
  if (!existsSync(path)) return [];
  const contents = readFileSync(path, 'utf8');
  if (!contents) return [];
  if (!contents.endsWith('\n')) throw new Error('PROSPECTIVE_CHAIN_INCOMPLETE');
  const entries: ProspectiveEntry[] = []; let previous: string | null = null;
  for (const line of contents.slice(0, -1).split('\n')) {
    const entry = JSON.parse(line) as ProspectiveEntry;
    const { entryHash, ...payload } = entry;
    if (entry.previousEntryHash !== previous || !/^[a-f0-9]{64}$/.test(entryHash) || sha256(JSON.stringify(payload)) !== entryHash) throw new Error('PROSPECTIVE_CHAIN_INVALID');
    if (entry.prediction.length !== 24 || entry.prediction.some((item, index) => item.periodo !== index + 1 || !Number.isFinite(item.precio_cop_kwh))) throw new Error('PROSPECTIVE_ENTRY_INVALID');
    entries.push(entry); previous = entryHash;
  }
  return entries;
}

export function appendFrozenPrediction(path: string, input: Omit<ProspectiveEntry, 'previousEntryHash' | 'entryHash'>): ProspectiveEntry {
  const lock = `${path}.lock`; let lockFd: number;
  try { lockFd = openSync(lock, 'wx'); } catch { throw new Error('PROSPECTIVE_REGISTRY_LOCKED'); }
  try {
    const entries = parseAndVerifyRegistry(path);
    if (entries.some(entry => entry.modelVersion === input.modelVersion && entry.forecastOriginDate === input.forecastOriginDate && entry.targetDate === input.targetDate && entry.horizonDays === input.horizonDays)) throw new Error('DUPLICATE_PROSPECTIVE_PREDICTION');
    const previousEntryHash = entries.at(-1)?.entryHash ?? null;
    const payload = { ...input, previousEntryHash }, entry = { ...payload, entryHash: sha256(JSON.stringify(payload)) };
    const fd = openSync(path, 'a');
    try { appendFileSync(fd, `${JSON.stringify(entry)}\n`, 'utf8'); fsyncSync(fd); } finally { closeSync(fd); }
    return entry;
  } finally { closeSync(lockFd); unlinkSync(lock); }
}

export function freezeCycle(input: { cutoff: string; now: Date; coverage: SourceCoverage; priceComplete: boolean; geneComplete: boolean; latestKnownPriceDate: string; records: PriceGeneRecord[]; models: FrozenV4Model[]; commit: string; tag: string; registryPath: string }) {
  const gate = assessOrigin(input);
  if (gate.status === 'unavailable') return { gate, appended: [] as ProspectiveEntry[], unavailable: [{ reason: gate.reason }] };
  const appended: ProspectiveEntry[] = []; const unavailable: { horizonDays?: number; targetDate?: string; reason: string }[] = [];
  for (const model of input.models) {
    if (model.modelVersion !== preregistrationVersion || model.state !== 'pendingProspectiveValidation' || model.horizonDays < 1 || model.horizonDays > 7) throw new Error('FROZEN_MODEL_INCOMPATIBLE');
    const targetDate = addDays(gate.origin, model.horizonDays);
    if (targetDate <= calendar(input.now) || targetDate <= input.latestKnownPriceDate) { unavailable.push({ horizonDays: model.horizonDays, targetDate, reason: 'TARGET_ALREADY_KNOWN_OR_NOT_FUTURE' }); continue; }
    try {
      const prediction = createProspectivePrediction({ records: input.records, model, targetDate, preregistrationCutoff: input.cutoff, sourceCoverage: gate.coverage, generatedAt: input.now.toISOString() });
      if (prediction.forecastOriginDate !== gate.origin || prediction.generatedAt <= input.cutoff) throw new Error('PROSPECTIVE_TIME_INVALID');
      const { priceWindowId, geneWindowId, priceConsolidatedId, geneConsolidatedId, priceEnergyDatasetId, geneEnergyDatasetId, priceWindowHash, geneWindowHash, priceContentHash, geneContentHash } = gate.coverage;
      appended.push(appendFrozenPrediction(input.registryPath, { ...prediction, preregistrationCommit: input.commit, preregistrationTag: input.tag, sourceIds: { priceWindowId, geneWindowId, priceConsolidatedId, geneConsolidatedId, priceEnergyDatasetId, geneEnergyDatasetId, priceWindowHash, geneWindowHash, priceContentHash, geneContentHash } }));
    } catch (error) {
      if (error instanceof Error && error.message === 'DUPLICATE_PROSPECTIVE_PREDICTION') { unavailable.push({ horizonDays: model.horizonDays, targetDate, reason: error.message }); continue; }
      throw error;
    }
  }
  return { gate, appended, unavailable };
}