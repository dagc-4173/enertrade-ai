import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ForecastError } from '@/services/forecast.contract';
import type artifact from './1.0.0/rule.json';
export type PriceRule = typeof artifact;

// Fixed-version semantic checksum covers every field, including evidence identities,
// ranges, metrics and the promotion decision. Not a provider authenticity signature.
// A changed rule or evaluation requires a reviewed version and checksum change.
const expectedDigest = '8b9553fd303c4b6f3b2e87e62a369e08784c6c480d50800d63a7525be564fe7a';
function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonical(record[key])).join(',') + '}';
  }
  throw new Error('Invalid rule value');
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export function validateRule(value: unknown): PriceRule {
  try {
    if (createHash('sha256').update(canonical(value)).digest('hex') !== expectedDigest) throw new Error('Invalid fixed rule');
    return freeze(structuredClone(value)) as PriceRule;
  } catch { throw new ForecastError(409, 'FORECAST_RULE_INCOMPATIBLE'); }
}
export function createRuleLoader(read: () => string) {
  let loaded = false;
  let rule: PriceRule | undefined;
  return () => {
    if (!loaded) {
      loaded = true;
      try { rule = validateRule(JSON.parse(read())); } catch { /* Cache safe failure as well as success. */ }
    }
    if (!rule) throw new ForecastError(409, 'FORECAST_RULE_INCOMPATIBLE');
    return rule;
  };
}
export const loadRule = createRuleLoader(() => readFileSync(new URL('./1.0.0/rule.json', import.meta.url), 'utf8'));
