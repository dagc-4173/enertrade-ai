const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const std = (x: number[]) => { const m = mean(x); return Math.sqrt(mean(x.map(v => (v - m) ** 2))) };
export function hourlyRidgeFeatures(series: 'demand' | 'price', c: number[], target: string, p: number) {
  if (c.length !== 672 || c.some(v => !Number.isFinite(v)) || !Number.isInteger(p) || p < 1 || p > 24) throw Error('INVALID_RIDGE_CONTEXT');
  const at = (lag: number) => c[(27 - lag) * 24 + p - 1]!;
  const weekday = (new Date(`${target}T00:00:00Z`).getUTCDay() + 6) % 7;
  const angle = 2 * Math.PI * (p - 1) / 24, week = 2 * Math.PI * weekday / 7;
  if (series === 'demand') {
    const month = Number(target.slice(5, 7)) - 1;
    return [at(0), at(1), at(6), at(13), at(27), c[671]!, c[647]!, mean(c.slice(-24)), mean(c.slice(-168)), std(c.slice(-168)), Math.sin(angle), Math.cos(angle), Math.sin(week), Math.cos(week), Math.sin(2 * Math.PI * month / 12), Math.cos(2 * Math.PI * month / 12), Number(weekday >= 5)];
  }
  const r7 = Array.from({ length: 7 }, (_, i) => at(i)), r14 = Array.from({ length: 14 }, (_, i) => at(i));
  return [...[0, 1, 2, 6, 7, 13, 14].map(at), mean(r7), mean(r14), std(r7), std(r14), Math.sin(angle), Math.cos(angle), Math.sin(week), Math.cos(week)];
}
