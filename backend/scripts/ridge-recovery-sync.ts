import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prisma } from '@/lib/prisma';
import { xmDailySyncService } from '@/services/xm-daily-sync.service';
const directory = resolve(import.meta.dir, '../../docs/evidencias/ridge-recovery', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(directory, { recursive: true });
try {
  const before = await xmDailySyncService.availability();
  await writeFile(resolve(directory, 'before.json'), JSON.stringify(before, null, 2), { flag: 'wx' });
  for (const metric of ['Gene', 'DemaSIN', 'PrecBolsNaci'] as const) {
    const result = await xmDailySyncService.sync(metric);
    await writeFile(resolve(directory, `${metric}.json`), JSON.stringify(result, null, 2), { flag: 'wx' });
    console.log(JSON.stringify(result));
  }
  const after = await xmDailySyncService.availability();
  await writeFile(resolve(directory, 'after.json'), JSON.stringify(after, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ directory, after }));
} finally { await prisma.$disconnect() }
