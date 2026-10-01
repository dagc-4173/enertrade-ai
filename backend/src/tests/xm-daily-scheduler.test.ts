import { expect, test } from 'bun:test';
import { createXmDailyScheduler } from '@/services/xm-daily-scheduler.service';

test('scheduler starts an asynchronous catch-up and can be stopped', async () => {
  let calls = 0; let completed = false;
  const scheduler = createXmDailyScheduler({ sync: async () => { calls++; completed = true; return { metrics: [] }; }, availability: async () => [] } as any, () => {});
  scheduler.start();
  for (let index = 0; index < 20 && !completed; index++) await Promise.resolve();
  scheduler.stop();
  expect(calls).toBe(1); expect(completed).toBe(true);
});