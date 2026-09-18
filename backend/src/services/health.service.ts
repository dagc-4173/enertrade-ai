import { prisma } from '@/lib/prisma';

export type HealthResult = {
  status: 'ok' | 'degraded';
  service: 'enertrade-backend';
  dependencies: { database: 'ok' | 'unavailable' };
};

export type HealthService = { check(): Promise<HealthResult> };

export function createHealthService(checkDatabase: () => Promise<unknown>, timeoutMs = 2_000): HealthService {
  return {
    async check() {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          checkDatabase(),
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('health database timeout')), timeoutMs); }),
        ]);
        return { status: 'ok', service: 'enertrade-backend', dependencies: { database: 'ok' } };
      } catch {
        return { status: 'degraded', service: 'enertrade-backend', dependencies: { database: 'unavailable' } };
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}

export const healthService = createHealthService(() => prisma.$queryRaw`SELECT 1`);