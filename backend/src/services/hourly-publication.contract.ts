import { calendarDate } from './forecast.contract';
import { businessDateInColombia } from './publication-expiration.service';
import { EnergyMarketInputError } from './energy-market.validation';

export function publicationWindow(now = new Date()) {
  const today = businessDateInColombia(now);
  const date = new Date(`${today}T00:00:00Z`);
  const dates: string[] = [];
  for (let day = 1; day <= 7; day++) { date.setUTCDate(date.getUTCDate() + 1); dates.push(date.toISOString().slice(0, 10)); }
  return { today, dates, timeZone: 'America/Bogota' as const };
}

export function validateHourlyPublication(body: unknown, now = new Date()) {
  const fail = (code: string, message: string): never => { throw new EnergyMarketInputError(code, message); };
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('INVALID_HOURLY_PUBLICATION', 'La publicación debe ser un objeto.');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['kind','days'].includes(key)) || !['offer','demand'].includes(String(input.kind)) || !Array.isArray(input.days) || !input.days.length || input.days.length > 7) return fail('INVALID_HOURLY_PUBLICATION', 'Selecciona oferta o demanda y entre uno y siete días.');
  const dates = new Set(publicationWindow(now).dates);
  const seenDates = new Set<string>();
  const days = input.days.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('INVALID_HOURLY_DAY', 'El día no es válido.');
    const day = value as Record<string, unknown>;
    if (Object.keys(day).some(key => !['deliveryDate','hours'].includes(key)) || typeof day.deliveryDate !== 'string' || !calendarDate(day.deliveryDate) || !dates.has(day.deliveryDate) || seenDates.has(day.deliveryDate)) return fail('INVALID_PUBLICATION_WINDOW', 'Cada fecha debe ser única y estar entre mañana y los próximos siete días.');
    seenDates.add(day.deliveryDate);
    if (!Array.isArray(day.hours) || !day.hours.length || day.hours.length > 24) return fail('INVALID_HOURLY_DAY', 'Selecciona entre una y 24 horas por día.');
    const seenHours = new Set<number>();
    const hours = day.hours.map(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('INVALID_HOURLY_SLOT', 'La franja no es válida.');
      const slot = value as Record<string, unknown>;
      if (Object.keys(slot).some(key => !['hour','quantityKwh','pricePerKwh'].includes(key)) || typeof slot.hour !== 'number' || !Number.isInteger(slot.hour) || slot.hour < 0 || slot.hour > 23 || seenHours.has(slot.hour)) return fail('INVALID_HOURLY_SLOT', 'Las horas deben ser únicas y estar entre 0 y 23.');
      seenHours.add(slot.hour);
      if (typeof slot.quantityKwh !== 'number' || !Number.isFinite(slot.quantityKwh) || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(slot.quantityKwh)) || slot.quantityKwh <= 0 || slot.quantityKwh > 999999999999999) return fail('INVALID_HOURLY_QUANTITY', 'La cantidad debe ser positiva y tener máximo dos decimales.');
      if (typeof slot.pricePerKwh !== 'number' || !Number.isFinite(slot.pricePerKwh) || !/^(?:0|[1-9]\d*)(?:\.\d{1,5})?$/.test(String(slot.pricePerKwh)) || slot.pricePerKwh <= 0 || slot.pricePerKwh > 999999999999) return fail('INVALID_HOURLY_PRICE', 'El precio debe ser positivo y tener máximo cinco decimales.');
      return { hour: slot.hour, quantityKwh: slot.quantityKwh, pricePerKwh: slot.pricePerKwh };
    });
    return { deliveryDate: day.deliveryDate, hours };
  });
  return { kind: input.kind as 'offer' | 'demand', days };
}
