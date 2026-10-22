import { acquireHourlyDemand, saveHourlyDemand } from '../src/integrations/xm-hourly-demand-acquisition';
import { ExternalDataError } from '../src/integrations/types/external-data';

const [startDate, endDate, directory, ...extra] = process.argv.slice(2);
if (!startDate || !endDate || !directory || extra.length) {
  console.error('Uso: bun scripts/xm-hourly-demand-capture.ts YYYY-MM-DD YYYY-MM-DD DIRECTORIO_NUEVO');
  process.exitCode = 1;
} else {
  try {
    const acquired = await acquireHourlyDemand({ startDate, endDate });
    const saved = await saveHourlyDemand(acquired, directory);
    console.log(JSON.stringify({ status: 'validated', directory: saved, metric: 'DemaReal', ...acquired.manifest.quality, rawSha256: acquired.manifest.rawSha256 }));
  } catch (error) {
    console.error(error instanceof ExternalDataError ? `${error.code}: ${error.message}` : 'XM_DEMAND_CAPTURE_FAILED: No fue posible consultar o conservar la captura; use un directorio nuevo con padre existente.');
    process.exitCode = 1;
  }
}
