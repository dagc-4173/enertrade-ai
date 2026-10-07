import { expect, test } from 'bun:test';
import { publicationWindow, validateHourlyPublication } from '@/services/hourly-publication.contract';
import { buildMatchingSuggestions } from '@/services/matching.service';
import { expireActivePublications } from '@/services/publication-expiration.service';
const now = new Date('2026-10-07T03:00:00Z'); // October 6 in Colombia.
const input = () => ({ kind: 'offer', days: [{ deliveryDate: '2026-10-07', hours: [{ hour: 0, quantityKwh: 10.25, pricePerKwh: 950.12345 }, { hour: 23, quantityKwh: 5, pricePerKwh: 800 }] }] });
test('HOUR-01: ventana de siete días usa Bogotá y cruza año', () => {
 expect(publicationWindow(now).dates).toEqual(['2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11','2026-10-12','2026-10-13']);
 expect(publicationWindow(new Date('2026-12-31T15:00:00Z')).dates.at(-1)).toBe('2027-01-07');
});
test('HOUR-02: horas discontinuas 0 y 23 y último día permitido', () => {
 expect(validateHourlyPublication(input(), now).days[0]!.hours.map(row => row.hour)).toEqual([0,23]);
 const value = input(); value.days[0]!.deliveryDate = '2026-10-13'; expect(validateHourlyPublication(value, now).days).toHaveLength(1);
});
test.each(['2026-10-06','2026-10-14','2026-02-30'])('HOUR-03: rechaza fecha %s', date => {
 const value = input(); value.days[0]!.deliveryDate = date; expect(() => validateHourlyPublication(value, now)).toThrow();
});
test.each([-1,24,1.5])('HOUR-04: rechaza hora %s', hour => {
 const value = input(); value.days[0]!.hours[0]!.hour = hour; expect(() => validateHourlyPublication(value, now)).toThrow();
});
test('HOUR-05: duplicados, vacíos, campos ajenos y precisión inválida', () => {
 const value = input(); value.days.push(value.days[0]!); expect(() => validateHourlyPublication(value, now)).toThrow();
 const slots = input(); slots.days[0]!.hours.push(slots.days[0]!.hours[0]!); expect(() => validateHourlyPublication(slots, now)).toThrow();
 expect(() => validateHourlyPublication({ ...input(), userId: 'intruder' }, now)).toThrow();
 expect(() => validateHourlyPublication({ kind: 'offer', days: [] }, now)).toThrow();
 const precision = input(); precision.days[0]!.hours[0]!.quantityKwh = 1.001; expect(() => validateHourlyPublication(precision, now)).toThrow();
});
test('HOUR-06: matching exige fecha/hora y usuarios distintos; no mezcla históricos', () => {
 const base = { quantityKwh: '10', deliveryDate: '2026-10-07', createdAt: '2026-10-06', status: 'ACTIVE' };
 const offer = { ...base, id: 'o', userId: 'a', hour: 8, pricePerKwh: '900' };
 const demand = { ...base, id: 'd', userId: 'b', hour: 8, maxPricePerKwh: '950' };
 expect(buildMatchingSuggestions([offer],[demand]).matches[0]!.hour).toBe(8);
 expect(buildMatchingSuggestions([offer],[{ ...demand, hour: 9 }]).matches).toHaveLength(0);
 expect(buildMatchingSuggestions([offer],[{ ...demand, userId: 'a' }]).matches).toHaveLength(0);
 expect(buildMatchingSuggestions([offer],[{ ...demand, hour: undefined }]).matches).toHaveLength(0);
});
test('HOUR-07: cerrar día cancela únicamente pendientes horarias', async () => {
 let args: any;
 await expireActivePublications({ energyTransaction: { updateMany: async value => { args = value; return {}; } } }, now);
 expect(args.where).toEqual({ status: 'PENDING_ACCEPTANCE', hour: { not: null }, deliveryDate: { lte: new Date('2026-10-06T00:00:00Z') } });
 expect(args.data).toEqual({ status: 'CANCELLED', cancelledAt: now });
});
