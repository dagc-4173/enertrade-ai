import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { prisma } from '@/lib/prisma';
import { csv, experiment, parseCsv, sha256, verifyCorpus } from '@/experiments/hu06-multihorizon';

const root = resolve(import.meta.dir, '..', '..');
const evidence = resolve(root, 'docs/evidencias/hu-06-multihorizon');
const corpusDirectory = resolve(evidence, 'corpus');
mkdirSync(corpusDirectory, { recursive: true });

const source = await prisma.xmConsolidatedDataset.findFirst({
  where: { metric: 'DemaSIN' },
  orderBy: [{ requestedTo: 'desc' }, { id: 'desc' }],
  select: { id: true, energyDatasetId: true, requestedFrom: true, requestedTo: true, contentHash: true, energyDataset: { select: { content: true, status: true, validationReport: true } } },
});
if (!source || source.energyDataset.status !== 'aprobado' || typeof source.energyDataset.content !== 'object' || source.energyDataset.content === null || !('records' in source.energyDataset.content) || !Array.isArray(source.energyDataset.content.records)) throw new Error('Latest approved DemaSIN consolidated dataset is invalid.');

const records = source.energyDataset.content.records.map(record => {
  if (!record || typeof record !== 'object' || !('fecha_xm' in record) || !('demanda_kwh' in record)) throw new Error('Invalid DemaSIN consolidated record.');
  return { fecha_xm: String(record.fecha_xm), demanda_kwh: Number(record.demanda_kwh) };
}).sort((left, right) => left.fecha_xm.localeCompare(right.fecha_xm));

const contents = csv(records);
const corpusFile = `xm-demandasin-${source.requestedFrom.toISOString().slice(0, 10)}_${source.requestedTo.toISOString().slice(0, 10)}.csv`;
const corpusPath = resolve(corpusDirectory, corpusFile);
writeFileSync(corpusPath, contents, 'utf8');
const frozenContents = readFileSync(corpusPath, 'utf8');
const frozenRecords = parseCsv(frozenContents);
const verified = verifyCorpus(frozenRecords);
const corpusHash = sha256(frozenContents);
const output = experiment(frozenRecords, corpusHash);

const manifest = {
  experimentId: output.experimentId,
  provider: 'XM/SINERGOX',
  source: { consolidatedDatasetId: source.id, energyDatasetId: source.energyDatasetId, contentHash: source.contentHash, validationStatus: source.energyDataset.status, validationReport: source.energyDataset.validationReport },
  extractedAt: new Date().toISOString(),
  corpus: { file: `docs/evidencias/hu-06-multihorizon/corpus/${corpusFile}`, sha256: corpusHash, range: { start: verified.firstDate, end: verified.lastDate }, observations: verified.observations, continuousDays: verified.observations, gaps: verified.gaps, duplicates: verified.duplicates, missingValues: verified.missingValues },
};
writeFileSync(resolve(corpusDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
writeFileSync(resolve(evidence, 'results.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');

const validationRows = Object.values(output.results).map((result: any) => {
  const ridge = result.validation.ridge.find((entry: any) => entry.alpha === result.validation.selectedAlpha).metrics;
  const baseline = result.validation.baselines[result.validation.baselineReference];
  return `| ${result.horizonDays} | ${result.validation.selectedAlpha} | ${result.validation.baselineReference} | ${ridge.MAE.toFixed(2)} | ${baseline.MAE.toFixed(2)} | ${ridge.RMSE.toFixed(2)} | ${ridge.bias.toFixed(2)} | ${ridge.WAPE.toFixed(6)} | ${result.candidate} |`;
}).join('\n');
const holdoutRows = Object.values(output.results).map((result: any) => {
  const ridge = result.externalHoldout.ridge; const baseline = result.externalHoldout.baselines[result.validation.baselineReference];
  return `| ${result.horizonDays} | ${result.validation.selectedAlpha} | ${result.validation.baselineReference} | ${ridge.MAE.toFixed(2)} | ${baseline.MAE.toFixed(2)} | ${ridge.RMSE.toFixed(2)} | ${ridge.bias.toFixed(2)} | ${ridge.WAPE.toFixed(6)} | ${result.candidate} |`;
}).join('\n');
const sampleRows = Object.values(output.results).map((result: any) => `| ${result.horizonDays} | ${result.samples.train} | ${result.samples.validation} | ${result.samples.externalHoldout} |`).join('\n');

writeFileSync(resolve(evidence, 'README.md'), `# HU-06 — Experimento directo multi-horizonte D+1..D+7\n\nExperimento offline de demanda agregada diaria del SIN. No modifica runtime, frontend, Oferta ni Precio. Cada horizonte aprende directamente \`X(t) -> demanda(t+h)\`; no consume predicciones ni usa recursión.\n\n## Corpus congelado\n\nConsolidado DemaSIN ${source.id}, EnergyDataset ${source.energyDatasetId}, ${verified.firstDate}..${verified.lastDate}, ${verified.observations} días continuos. SHA-256: \`${corpusHash}\`. El CSV se escribe, relee y verifica antes de entrenar; no se entrena desde PostgreSQL vivo.\n\n## Features V1\n\n- \`demanda(t)\`\n- \`demanda(t-6)\`\n- \`demanda(t-13)\`\n- \`demanda(t-27)\`\n- seno/coseno del weekday calendario de \`targetDate\`\n\nPara h=1 son exactamente D-1, D-7, D-14 y D-28 respecto al target del modelo anterior. Para h>1 permanecen expresadas respecto al origen observado t. Toda feature de demanda tiene fecha <=t.\n\n## Particiones fijadas antes de evaluar\n\n- TRAIN targets: ${output.partitions.train.start}..${output.partitions.train.end}\n- VALIDATION: ${output.partitions.validation.start}..${output.partitions.validation.end}\n- EXTERNAL HOLDOUT: ${output.partitions.externalHoldout.start}..${output.partitions.externalHoldout.end}\n\nEl holdout anterior de HU-06 terminó el 2024-09-28. El bloque 2026 es posterior y no fue usado por los experimentos D+1 documentados; constituye un holdout temporal virgen para Demanda según la evidencia disponible. El holdout no participa en baseline, alpha ni scaler.\n\n| h | TRAIN | VALIDATION | HOLDOUT |\n|---:|---:|---:|---:|\n${sampleRows}\n\n## Promoción predefinida\n\nCero indisponibles atribuibles al modelo, parámetros/métricas finitos, mejora MAE holdout >=1% frente al baseline seleccionado solo en VALIDATION, WAPE holdout no mayor al baseline y error absoluto máximo <=10 veces la desviación estándar de targets TRAIN. No se relaja después de observar el holdout.\n\n## Alcance\n\nLos candidatos son técnicos y experimentales. No representan demanda individual ni zonal, no definen confidence y no acreditan validación académica ni estabilidad futura.\n`, 'utf8');

writeFileSync(resolve(evidence, 'resultados.md'), `# Resultados HU-06 multi-horizonte V1\n\n## VALIDATION\n\n| h | alpha | baseline | MAE Ridge | MAE baseline | RMSE Ridge | Bias Ridge | WAPE Ridge | candidate final |\n|---:|---:|---|---:|---:|---:|---:|---:|---|\n${validationRows}\n\n## EXTERNAL HOLDOUT\n\n| h | alpha | baseline | MAE Ridge | MAE baseline | RMSE Ridge | Bias Ridge | WAPE Ridge | candidate |\n|---:|---:|---|---:|---:|---:|---:|---:|---|\n${holdoutRows}\n\nLas métricas completas, baselines y criterios están en [results.json](results.json). Candidate no intervino en selección y se calculó una vez con la regla predefinida.\n`, 'utf8');
writeFileSync(resolve(evidence, 'pruebas.md'), '# Pruebas\n\nEjecutar `bun test src/tests/hu06-multihorizon.test.ts`. Cubre corpus, continuidad, h1/h7, anti-leakage, scaler TRAIN, selección VALIDATION, aislamiento holdout, métricas finitas, paridad y ausencia de artefactos candidate=false.\n', 'utf8');

for (const result of Object.values(output.results) as any[]) if (result.candidate) {
  const modelPath = resolve(root, `backend/src/models/${result.modelId}/1.0.0/model.json`);
  mkdirSync(dirname(modelPath), { recursive: true });
  const artifact = {
    modelId: result.modelId, modelVersion: result.modelVersion, algorithm: 'ridge', experimentVersion: 'v1', hyperparameters: { alpha: result.validation.selectedAlpha }, horizonDays: result.horizonDays,
    forecastOriginDefinition: result.originDefinition, targetDefinition: result.targetDefinition, orderedFeatures: result.orderedFeatures,
    coefficients: result.artifact.coefficients, intercept: result.artifact.intercept,
    scaler: { ddof: 0, means: result.artifact.means, standardDeviations: result.artifact.standardDeviations },
    trainingRange: result.ranges.train, validationRange: result.ranges.validation, externalHoldoutRange: result.ranges.externalHoldout,
    corpusHash: result.corpusHash,
    metrics: { validation: result.validation.ridge.find((entry: any) => entry.alpha === result.validation.selectedAlpha).metrics, externalHoldout: result.externalHoldout.ridge },
    baseline: { selectedOn: 'validation', reference: result.validation.baselineReference, validation: result.validation.baselines[result.validation.baselineReference], externalHoldout: result.externalHoldout.baselines[result.validation.baselineReference] },
    promotionCriteria: result.promotionCriteria,
    limitations: ['Experimental offline artifact; not loaded by runtime.', 'Aggregated SIN demand; not individual or zonal demand.', 'No recursive forecasting or predicted features.', 'No weather, holidays, price or confidence interval.', 'Academic/formal validation pending.'],
  };
  writeFileSync(modelPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({ manifest, candidates: Object.values(output.results).filter((result: any) => result.candidate).map((result: any) => result.modelId) }, null, 2));
await prisma.$disconnect();