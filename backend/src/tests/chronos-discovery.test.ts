import { expect, test } from 'bun:test';
import { discoverHourlyDemand } from '@/integrations/xm-hourly-demand-acquisition';
const item = (Date: string, complete = true) => ({ Date, HourlyEntities: [{ Id: 'Sistema', Values: { code: 'Sistema', ...Object.fromEntries(Array.from({ length: complete ? 24 : 23 }, (_, i) => [`Hour${String(i + 1).padStart(2, '0')}`, '8000000.25'])) } }] });
test('CHD-01: discovery excludes current/future days and selects latest complete day', async () => {
  const found = await discoverHourlyDemand('2026-10-21', async (url, init) => {
    expect(url).toBe('https://servapibi.xm.com.co/hourly');
    expect(JSON.parse(init.body as string)).toMatchObject({ MetricId: 'DemaReal', Entity: 'Sistema', StartDate: '2026-10-14', EndDate: '2026-10-20' });
    return Response.json({ Metric: { Id: 'DemaReal' }, Items: [item('2026-10-17'), item('2026-10-18', false)] });
  });
  expect(found.latestCompleteDay).toBe('2026-10-17'); expect(found.incompleteDates).toEqual(['2026-10-18']);
});
test('CHD-02: empty availability is explicit; duplicate or outside dates fail', async () => {
  expect((await discoverHourlyDemand('2026-10-21', async () => Response.json({ Metric: { Id: 'DemaReal' }, Items: [] }))).latestCompleteDay).toBeNull();
  for (const items of [[item('2026-10-17'), item('2026-10-17')], [item('2026-10-21')]]) await expect(discoverHourlyDemand('2026-10-21', async () => Response.json({ Metric: { Id: 'DemaReal' }, Items: items }))).rejects.toMatchObject({ code: 'EXTERNAL_RESPONSE_INVALID' });
});
