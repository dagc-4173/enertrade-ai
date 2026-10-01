import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '@/lib/prisma';
import { addDays, orderedFeaturesV4, preregistrationVersion, type FrozenV4Model, type PriceGeneRecord } from '@/experiments/hu08-price-v4-preregistration';
import { assessOrigin, freezeCycle, parseAndVerifyRegistry, type SourceCoverage } from '@/experiments/hu08-price-v4-prospective';

const root = resolve(import.meta.dir, '..', '..');
const tag = 'hu08-v4-preregistered';
const evidence = resolve(root, 'docs/evidencias/hu-08-price-v4-preregistration');
const registryPath = resolve(root, 'docs/evidencias/hu-08-price-v4-prospective/predictions.jsonl');
function git(...args: string[]) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); }
const commit = git('rev-parse', `${tag}^{commit}`);
if (git('rev-parse', 'HEAD') !== commit && git('merge-base', commit, 'HEAD') !== commit) throw new Error('PREREGISTRATION_NOT_ANCESTOR');
function committedFile(relative: string) {
  const disk = readFileSync(resolve(root, relative), 'utf8');
  if (disk.trimEnd() !== git('show', `${tag}:${relative}`).trimEnd()) throw new Error(`FROZEN_ARTIFACT_CHANGED: ${relative}`);
  return disk;
}
const manifest = JSON.parse(committedFile('docs/evidencias/hu-08-price-v4-preregistration/manifest.json')) as {
  preregistrationCutoff: string; preregistrationVersion: string; frozenModels: Record<string, FrozenV4Model>;
};
if (manifest.preregistrationVersion !== preregistrationVersion) throw new Error('PREREGISTRATION_VERSION_MISMATCH');
const models = Array.from({ length: 7 }, (_, index) => {
  const horizon = index + 1;
  const model = JSON.parse(committedFile(`docs/evidencias/hu-08-price-v4-preregistration/frozen-models/h${horizon}.json`)) as FrozenV4Model;
  if (JSON.stringify(model) !== JSON.stringify(manifest.frozenModels[String(horizon)]) || model.horizonDays !== horizon || JSON.stringify(model.orderedFeatures) !== JSON.stringify(orderedFeaturesV4)) throw new Error('FROZEN_MODEL_MISMATCH');
  return model;
});
parseAndVerifyRegistry(registryPath);

async function latest(metric: string) {
  const consolidated = await prisma.xmConsolidatedDataset.findFirst({ where: { metric }, orderBy: [{ requestedTo: 'desc' }, { id: 'desc' }], select: { id: true, energyDatasetId: true, contentHash: true, requestedTo: true, sources: { select: { xmIngestionWindow: { select: { id: true, requestedFrom: true, requestedTo: true, fetchedAt: true, rowCount: true, contentHash: true, status: true } } } }, energyDataset: { select: { status: true } } } });
  const day = consolidated?.requestedTo.toISOString().slice(0, 10);
  const window = consolidated?.sources.map(item => item.xmIngestionWindow).find(item => item.requestedFrom.toISOString().slice(0, 10) <= day! && item.requestedTo.toISOString().slice(0, 10) === day);
  return { consolidated, window, day };
}

function checkRows(rows: any[], start: string, end: string, field: 'precio_cop_kwh' | 'energia_kwh') {
  const keys = new Set<string>();
  for (const row of rows) {
    const date = String(row.fecha_xm), period = Number(row.periodo ?? row.hora_xm), value = Number(row[field]), key = `${date}|${period}`;
    if (date < start || date > end || !Number.isInteger(period) || period < 1 || period > 24 || !Number.isFinite(value) || keys.has(key)) return false;
    keys.add(key);
  }
  for (let date = start; date <= end; date = addDays(date, 1)) for (let period = 1; period <= 24; period++) if (!keys.has(`${date}|${period}`)) return false;
  return true;
}

try {
  const now = new Date();
  const [price, gene, latestPriceWindow] = await Promise.all([
    latest('PrecBolsNaci'), latest('Gene'),
    prisma.xmIngestionWindow.findFirst({ where: { metric: 'PrecBolsNaci', provider: 'xm', energyDatasetId: { not: null } }, orderBy: [{ receivedTo: 'desc' }, { id: 'desc' }], select: { receivedTo: true } })
  ]);
  if (!price.consolidated || !gene.consolidated || !price.window || !gene.window || !price.day || !gene.day) {
    console.log(JSON.stringify({ status: 'unavailable', reason: 'SOURCE_NOT_CONSOLIDATED', appended: 0 }));
  } else {
    const coverage: SourceCoverage = {
      priceUntil: price.day, geneUntil: gene.day,
      priceFetchedAt: price.window.fetchedAt?.toISOString() ?? '', geneFetchedAt: gene.window.fetchedAt?.toISOString() ?? '',
      priceWindowId: price.window.id, geneWindowId: gene.window.id,
      priceConsolidatedId: price.consolidated.id, geneConsolidatedId: gene.consolidated.id,
      priceEnergyDatasetId: price.consolidated.energyDatasetId, geneEnergyDatasetId: gene.consolidated.energyDatasetId,
      priceWindowHash: price.window.contentHash ?? '', geneWindowHash: gene.window.contentHash ?? '',
      priceContentHash: price.consolidated.contentHash, geneContentHash: gene.consolidated.contentHash
    };
    const complete = (source: typeof price) => source.consolidated!.energyDataset.status === 'aprobado' && source.window!.status === 'completed' && source.window!.rowCount === (Math.round((source.window!.requestedTo.getTime() - source.window!.requestedFrom.getTime()) / 86_400_000) + 1) * 24 && !!source.window!.contentHash;
    const gate = assessOrigin({ cutoff: manifest.preregistrationCutoff, now, coverage, priceComplete: complete(price), geneComplete: complete(gene) });
    if (gate.status === 'unavailable') {
      console.log(JSON.stringify({ status: 'unavailable', reason: gate.reason, coverage, appended: 0 }));
    } else {
      const start = addDays(gate.origin, -14);
      const readSource = (id: number) => prisma.$queryRaw<{ record: unknown }[]>`SELECT item AS record FROM "EnergyDataset" dataset CROSS JOIN LATERAL jsonb_array_elements(dataset.content->'records') item WHERE dataset.id = ${id} AND item->>'fecha_xm' BETWEEN ${start} AND ${gate.origin}`;
      const [priceRaw, geneRaw] = await Promise.all([readSource(price.consolidated.energyDatasetId), readSource(gene.consolidated.energyDatasetId)]);
      const priceRows = priceRaw.map(item => item.record), geneRows = geneRaw.map(item => item.record);
      if (!checkRows(priceRows, start, gate.origin, 'precio_cop_kwh') || !checkRows(geneRows, start, gate.origin, 'energia_kwh')) {
        console.log(JSON.stringify({ status: 'unavailable', reason: 'SOURCE_INCOMPLETE_24_PERIODS', coverage, appended: 0 }));
      } else {
        const geneByKey = new Map<string, number>(), totals = new Map<string, number>();
        for (const item of geneRows as any[]) { const date = String(item.fecha_xm), value = Number(item.energia_kwh); geneByKey.set(`${date}|${item.hora_xm}`, value); totals.set(date, (totals.get(date) ?? 0) + value); }
        const records: PriceGeneRecord[] = (priceRows as any[]).map(item => ({ fecha_xm: String(item.fecha_xm), periodo: Number(item.periodo), precio_cop_kwh: Number(item.precio_cop_kwh), generacion_kwh: geneByKey.get(`${item.fecha_xm}|${item.periodo}`)!, generacion_total_diaria_kwh: totals.get(String(item.fecha_xm))! }));
        const result = freezeCycle({ cutoff: manifest.preregistrationCutoff, now, coverage, priceComplete: true, geneComplete: true, latestKnownPriceDate: latestPriceWindow?.receivedTo?.toISOString().slice(0, 10) ?? gate.origin, records, models, commit, tag, registryPath });
        console.log(JSON.stringify({ status: result.appended.length ? 'captured' : 'unavailable', origin: gate.origin, coverage, appended: result.appended.map(entry => ({ horizonDays: entry.horizonDays, targetDate: entry.targetDate, entryHash: entry.entryHash })), unavailable: result.unavailable }));
      }
    }
  }
} finally { await prisma.$disconnect(); }