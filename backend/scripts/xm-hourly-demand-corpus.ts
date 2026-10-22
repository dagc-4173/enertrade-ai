import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { acquireHourlyDemand, saveHourlyDemand, type HourlyDemandAcquisition } from '../src/integrations/xm-hourly-demand-acquisition';
import { corpusProtocol, corpusWindows, windowId, prepareHourlyDemandCorpus } from '../src/integrations/xm-hourly-demand-corpus';

async function exists(path: string) { try { await access(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } }
async function load(directory: string): Promise<HourlyDemandAcquisition> {
  return { rawBody: await readFile(join(directory, 'raw.json'), 'utf8'), catalogRawBody: await readFile(join(directory, 'catalog-raw.json'), 'utf8'),
    normalized: JSON.parse(await readFile(join(directory, 'normalized.json'), 'utf8')), manifest: JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) };
}
export async function runCorpus(directory: string, verifyOnly: boolean) {
  const root = resolve(directory), planPath = join(root, 'plan.json');
  const plan = JSON.stringify(corpusProtocol, null, 2) + '\n';
  if (await exists(root)) {
    if (await readFile(planPath, 'utf8') !== plan) throw Error('CORPUS_PLAN_INCOMPATIBLE');
  } else {
    if (verifyOnly) throw Error('CORPUS_NOT_FOUND');
    await mkdir(root, { recursive: false });
    await writeFile(planPath, plan, { flag: 'wx' });
    await mkdir(join(root, 'windows'));
  }
  const finalExists = await exists(join(root, 'manifest.json'));
  const acquisitions: HourlyDemandAcquisition[] = [];
  const windows = corpusWindows();
  for (const [index, range] of windows.entries()) {
    const target = join(root, 'windows', windowId(range));
    let acquisition: HourlyDemandAcquisition;
    if (await exists(target)) acquisition = await load(target);
    else {
      if (verifyOnly || finalExists) throw Error('CORPUS_WINDOW_MISSING');
      acquisition = await acquireHourlyDemand(range);
      await saveHourlyDemand(acquisition, target);
      await new Promise(resolve => setTimeout(resolve, 750));
    }
    // Validate the window immediately, including reused snapshots, before continuing.
    const { replayHourlyDemand } = await import('../src/integrations/xm-hourly-demand-acquisition');
    replayHourlyDemand(acquisition);
    if (windowId(acquisition.manifest.requestedRange) !== windowId(range)) throw Error('CORPUS_WINDOW_RANGE_INVALID');
    acquisitions.push(acquisition);
    console.log(JSON.stringify({ progress: `${index + 1}/${windows.length}`, window: windowId(range), rows: acquisition.normalized.records.length }));
  }
  const prepared = prepareHourlyDemandCorpus(acquisitions);
  const manifestText = JSON.stringify(prepared.manifest, null, 2) + '\n';
  if (finalExists || verifyOnly) {
    if (await readFile(join(root, 'corpus.csv'), 'utf8') !== prepared.csv || await readFile(join(root, 'manifest.json'), 'utf8') !== manifestText) throw Error('CORPUS_INTEGRITY_FAILED');
  } else {
    await writeFile(join(root, 'corpus.csv'), prepared.csv, { flag: 'wx' });
    await writeFile(join(root, 'manifest.json'), manifestText, { flag: 'wx' });
  }
  console.log(JSON.stringify({ status: 'verified', root, rows: prepared.manifest.rowCount, days: prepared.manifest.completeDays, corpusSha256: prepared.manifest.corpusSha256, partitions: prepared.manifest.partitions }));
}
if (import.meta.main) {
  const [mode, directory, ...extra] = process.argv.slice(2);
  if (!['--capture', '--verify'].includes(mode ?? '') || !directory || extra.length) {
    console.error('Uso: bun scripts/xm-hourly-demand-corpus.ts --capture|--verify DIRECTORIO'); process.exitCode = 1;
  } else {
    try { await runCorpus(directory, mode === '--verify'); }
    catch (error) { console.error(JSON.stringify({ status: 'failed', code: error instanceof Error ? error.message : 'CORPUS_FAILED', note: 'No se sobrescribe evidencia; las ventanas completas permiten reanudar. Sin manifiesto final no hay corpus completo.' })); process.exitCode = 1; }
  }
}
