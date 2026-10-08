import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

const entrypoint = new URL('../../index.ts', import.meta.url).href;
const cases = [
  { name: 'absent', value: undefined, enabled: true },
  { name: 'true', value: 'true', enabled: true },
  { name: 'false', value: 'false', enabled: false },
  { name: 'empty', value: '', enabled: true },
  { name: 'FALSE', value: 'FALSE', enabled: true },
  { name: 'False', value: 'False', enabled: true },
  { name: '0', value: '0', enabled: true },
  { name: 'whitespace around false', value: ' false ', enabled: true },
];

for (const { name, value, enabled } of cases) {
  test(`startup with XM_AUTO_SYNC_ENABLED=${name}: scheduler ${enabled ? 'enabled' : 'disabled'}`, () => {
    const env: NodeJS.ProcessEnv = { ...process.env, PORT: '3000' };
    delete env.DATABASE_URL;
    if (value === undefined) delete env.XM_AUTO_SYNC_ENABLED;
    else env.XM_AUTO_SYNC_ENABLED = value;

    const result = Bun.spawnSync({
      cmd: [process.execPath, '--no-env-file', '--eval', `
        import { mock } from 'bun:test';
        const state = { listenCalls: 0, port: null, startCalls: 0, timerCalls: 0, messages: [] };
        console.log = (...args) => state.messages.push(args.join(' '));
        globalThis.setTimeout = () => { state.timerCalls++; return 1; };
        mock.module('dotenv/config', () => ({}));
        mock.module('@/lib/prisma', () => { throw new Error('Prisma import forbidden in startup guard test'); });
        mock.module('@/app', () => ({
          app: { listen(port, ready) { state.listenCalls++; state.port = port; ready(); } }
        }));
        mock.module('@/services/xm-daily-scheduler.service', () => ({
          xmDailyScheduler: { start() { state.startCalls++; setTimeout(() => {}, 1000); } }
        }));
        await import(${JSON.stringify(entrypoint)});
        process.stdout.write(JSON.stringify(state));
      `],
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      env,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.stderr.toString()).toBe('');
    expect(result.exitCode).toBe(0);
    const state: {
      listenCalls: number;
      port: number;
      startCalls: number;
      timerCalls: number;
      messages: string[];
    } = JSON.parse(result.stdout.toString());
    expect(state.listenCalls).toBe(1);
    expect(state.port).toBe(3000);
    expect(state.startCalls).toBe(enabled ? 1 : 0);
    expect(state.timerCalls).toBe(enabled ? 1 : 0);
    expect(state.messages).toContain('Server is running on port 3000');
    if (!enabled) {
      expect(state.messages).toContain('Automatic XM scheduler disabled; XM functionality and manual synchronization endpoints remain enabled.');
    } else {
      expect(state.messages.some(message => message.includes('scheduler disabled'))).toBe(false);
    }
  });
}
