import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateDemandObservationEligibility, demandSemanticRule } from '@/services/demand-semantic-eligibility';
import { parseCsv, sha256, verifyCorpus } from '@/experiments/hu06-multihorizon';
import { semanticExperimentV1, semanticExperimentV2 } from '@/experiments/hu06-multihorizon-semantic';

const root = resolve(import.meta.dir, '..', '..');
const originalV1Directory = resolve(root, 'docs/evidencias/hu-06-multihorizon');
const originalV2Directory = resolve(root, 'docs/evidencias/hu-06-multihorizon-v2');
const evidence = resolve(root, 'docs/evidencias/hu-06-multihorizon-v3-semantic');
const manifestV1 = JSON.parse(readFileSync(resolve(originalV1Directory, 'corpus/manifest.json'), 'utf8')) as any;
const originalV1 = JSON.parse(readFileSync(resolve(originalV1Directory, 'results.json'), 'utf8')) as any;
const originalV2 = JSON.parse(readFileSync(resolve(originalV2Directory, 'results.json'), 'utf8')) as any;
const corpusPath = resolve(root, manifestV1.corpus.file); const corpusText = readFileSync(corpusPath, 'utf8'); const corpusHash = sha256(corpusText);
if (corpusHash !== '18fd5aad3fe12eaa5290dba9ea551ccaef1a2baf4f41febf0c0354f0252c1735' || corpusHash !== manifestV1.corpus.sha256) throw new Error('HU-06 frozen corpus hash mismatch.');
const records = parseCsv(corpusText); const corpus = verifyCorpus(records);
if (corpus.firstDate !== '2024-01-01' || corpus.lastDate !== '2026-09-29' || corpus.observations !== 1003) throw new Error('HU-06 frozen corpus integrity mismatch.');
const eligibility = evaluateDemandObservationEligibility(records.map(record => ({ date: record.fecha_xm, value: record.demanda_kwh })));
const semanticExcludedDates = eligibility.filter(item => item.semanticStatus === 'SEMANTIC_REVIEW_REQUIRED').map(item => item.date);
if (JSON.stringify(semanticExcludedDates) !== JSON.stringify(['2026-09-16', '2026-09-28', '2026-09-29'])) throw new Error('Unexpected semantic exclusion set.');

const semanticV1 = semanticExperimentV1(records, corpusHash); const semanticV2 = semanticExperimentV2(records, corpusHash);
const comparison: Record<string, unknown> = {};
for (let horizonDays = 1; horizonDays <= 7; horizonDays++) {
  const key = String(horizonDays); const originalV1Result = originalV1.results[key]; const originalV2Result = originalV2.results[key]; const semanticV1Result = semanticV1.results[key] as any; const semanticV2Result = semanticV2.results[key] as any;
  comparison[key] = {
    horizonDays,
    originalV1: { metrics: originalV1Result.externalHoldout.ridge, candidate: originalV1Result.candidate },
    originalV2: { metrics: originalV2Result.externalHoldout.ridge, candidate: originalV2Result.candidate },
    semanticV1: { metrics: semanticV1Result.retrospectiveEvaluation.ridge, technicalCandidate: semanticV1Result.technicalCandidate },
    semanticV2: { metrics: semanticV2Result.retrospectiveEvaluation.ridge, technicalCandidate: semanticV2Result.technicalCandidate },
  };
}
const results = {
  experimentId: 'hu-06-multihorizon-v3-semantic', evaluationType: 'retrospective_technical_reevaluation',
  warning: 'The 2026-06-01..2026-09-29 block is not an external virgin holdout; its anomalies were observed before this semantic policy was designed.',
  corpus: { file: manifestV1.corpus.file, sha256: corpusHash, range: { start: corpus.firstDate, end: corpus.lastDate }, observations: corpus.observations, semanticExcludedDates },
  semanticPolicy: demandSemanticRule, partitions: semanticV1.partitions, v1: semanticV1, v2: semanticV2, comparison,
};
mkdirSync(evidence, { recursive: true });
writeFileSync(resolve(evidence, 'results.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8');
writeFileSync(resolve(evidence, 'manifest.json'), `${JSON.stringify({ experimentId: results.experimentId, evaluationType: results.evaluationType, warning: results.warning, corpus: results.corpus, semanticPolicy: results.semanticPolicy, partitions: results.partitions, originalResults: ['docs/evidencias/hu-06-multihorizon/results.json', 'docs/evidencias/hu-06-multihorizon-v2/results.json'], generatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');

const samplesRows = (family: any) => Object.values(family.results).map((result: any) => `| ${result.horizonDays} | ${result.samples.train} | ${result.samples.validation} | ${result.samples.retrospectiveEvaluation} |`).join('\n');
const resultRows = (family: any) => Object.values(family.results).map((result: any) => { const metrics = result.retrospectiveEvaluation.ridge; const baseline = result.retrospectiveEvaluation.baselines[result.validation.baselineReference]; return `| ${result.horizonDays} | ${result.validation.selectedAlpha} | ${result.validation.baselineReference} | ${metrics.MAE.toFixed(2)} | ${baseline.MAE.toFixed(2)} | ${metrics.RMSE.toFixed(2)} | ${metrics.bias.toFixed(2)} | ${metrics.WAPE.toFixed(6)} | ${metrics.maxAbsoluteErrorKwh.toFixed(2)} | ${result.retrospectiveEvaluation.catastrophicThresholdKwh.toFixed(2)} | ${result.technicalCandidate} |`; }).join('\n');
const comparisonRows = Object.values(comparison).map((entry: any) => { const semantic = (semanticV2.results[String(entry.horizonDays)] as any); return `| ${entry.horizonDays} | ${entry.originalV2.metrics.MAE.toFixed(2)} | ${entry.semanticV2.metrics.MAE.toFixed(2)} | ${semantic.validation.baselineReference} (${semantic.retrospectiveEvaluation.baselines[semantic.validation.baselineReference].MAE.toFixed(2)}) | ${entry.semanticV2.metrics.WAPE.toFixed(6)} | ${entry.semanticV2.technicalCandidate} |`; }).join('\n');
const prospectiveRows = Object.values(semanticV2.results).map((result: any) => `| ${result.horizonDays} | ${result.validation.selectedAlpha} | ${result.validation.baselineReference} |`).join('\n');

writeFileSync(resolve(evidence, 'README.md'), `# HU-06 — Reevaluación retrospectiva multi-horizonte con elegibilidad semántica\n\n## Naturaleza de la ejecución\n\nEsta es una **reevaluación retrospectiva técnica**. El bloque 2026-06-01..2026-09-29 no es un holdout externo virgen: sus anomalías se observaron antes de diseñar la política semántica. Ningún \`technicalCandidate\` equivale a validación académica o externa independiente.\n\n## Corpus y política\n\nSe reutiliza sin cambios el CSV \`${manifestV1.corpus.file}\`, SHA-256 \`${corpusHash}\`, rango ${corpus.firstDate}..${corpus.lastDate}, ${corpus.observations} observaciones. Permanecen físicamente 16/09, 28/09 y 29/09; se excluyen solo al construir muestras mediante \`demand-semantic-eligibility.ts\`. Regla: ratio contra mediana previa, ventana 14, mínimo 7, threshold 0.20.\n\n## Particiones\n\n- TRAIN: ${semanticV1.partitions.train.start}..${semanticV1.partitions.train.end}\n- VALIDATION: ${semanticV1.partitions.validation.start}..${semanticV1.partitions.validation.end}\n- RETROSPECTIVE EVALUATION: ${semanticV1.partitions.retrospectiveEvaluation.start}..${semanticV1.partitions.retrospectiveEvaluation.end}\n\nAlpha, baseline y scaler se seleccionan/ajustan solo con TRAIN/VALIDATION elegibles. La evaluación retrospectiva no interviene en selección. Features, baselines, grid y promoción permanecen idénticos a V1/V2. El umbral catastrófico se recalcula con targets TRAIN elegibles. No se generan artefactos runtime.\n\n## Muestras V1\n\n| h | TRAIN | VALIDATION | RETROSPECTIVE EVALUATION |\n|---:|---:|---:|---:|\n${samplesRows(semanticV1)}\n\n## Muestras V2\n\n| h | TRAIN | VALIDATION | RETROSPECTIVE EVALUATION |\n|---:|---:|---:|---:|\n${samplesRows(semanticV2)}\n\n## Prospective validation required\n\nDesde esta ejecución quedan congelados para una evaluación futura: corpus de entrenamiento, features V1/V2, alpha seleccionado por horizonte, baseline seleccionado, regla semántica \`${demandSemanticRule.id}\` y criterios de aceptación. Los parámetros Ridge ajustados quedan en \`results.json\`, no como artefactos runtime. Datos recibidos después del cierre se evaluarán prospectivamente sin cambiar modelo, features, alpha, baseline, regla semántica ni promoción. No se fija todavía una fecha final porque no existe suficiente información futura independiente.\n\n| h | alpha V2 congelado | baseline V2 congelado |\n|---:|---:|---|\n${prospectiveRows}\n`, 'utf8');
writeFileSync(resolve(evidence, 'resultados.md'), `# Resultados de reevaluación semántica\n\n## V1\n\n| h | alpha | baseline | MAE Ridge | MAE baseline | RMSE | Bias | WAPE | max abs error | catastrophic threshold | technicalCandidate |\n|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---|\n${resultRows(semanticV1)}\n\n## V2\n\n| h | alpha | baseline | MAE Ridge | MAE baseline | RMSE | Bias | WAPE | max abs error | catastrophic threshold | technicalCandidate |\n|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---|\n${resultRows(semanticV2)}\n\n## Original V2 vs reevaluación V2 semántica\n\n| h | original V2 MAE | semantic MAE | baseline (MAE) | semantic WAPE | technicalCandidate |\n|---:|---:|---:|---|---:|---|\n${comparisonRows}\n\nLos cambios proceden exclusivamente del filtrado semántico de muestras y del reajuste/scaler sobre TRAIN elegible. En este corpus las exclusiones están fuera de TRAIN/VALIDATION, por lo que parámetros seleccionados solo cambiarían si una fecha excluida afectara sus inputs o targets.\n`, 'utf8');
writeFileSync(resolve(evidence, 'pruebas.md'), '# Pruebas\n\nEjecutar `bun test src/tests/hu06-multihorizon-semantic.test.ts`. Verifica hash/corpus, exclusión de 16/28/29 como input o target, recuperación 17..27, rolling V2, selección solo validation, uso de la abstracción runtime, ausencia de Prisma y ausencia de modelos runtime V3.\n', 'utf8');

console.log(JSON.stringify({ corpusHash, semanticExcludedDates, technicalCandidatesV1: Object.values(semanticV1.results).filter((result: any) => result.technicalCandidate).map((result: any) => result.horizonDays), technicalCandidatesV2: Object.values(semanticV2.results).filter((result: any) => result.technicalCandidate).map((result: any) => result.horizonDays) }, null, 2));