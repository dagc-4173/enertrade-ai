import { xmDailySyncService } from './xm-daily-sync.service';

export type XmDailyScheduler = { start(): void; stop(): void };

export function createXmDailyScheduler(sync: typeof xmDailySyncService = xmDailySyncService, log: (message: string, value?: unknown) => void = console.error): XmDailyScheduler {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const scheduleNext = () => {
    if (stopped) return;
    const now = new Date(); const next = new Date(now); next.setHours(24, 5, 0, 0);
    timer = setTimeout(() => { void run(); }, Math.max(1000, next.getTime() - now.getTime()));
  };
  const run = async () => {
    if (stopped) return;
    try { log('XM daily synchronization completed.', await sync.sync()); } catch (error) { log('XM daily synchronization failed.', error); } finally { scheduleNext(); }
  };
  return { start() { stopped = false; void run(); }, stop() { stopped = true; if (timer) clearTimeout(timer); } };
}

export const xmDailyScheduler = createXmDailyScheduler();