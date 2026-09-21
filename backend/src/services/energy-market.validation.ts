import { calendarDate } from '@/services/forecast.contract';
import { businessDateInColombia, isPublicationExpired } from '@/services/publication-expiration.service';

export class EnergyMarketInputError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function positiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new EnergyMarketInputError('INVALID_MARKET_VALUE', `${field} debe ser un número finito mayor que cero.`);
  }
  return value;
}

function validateBody(body: unknown, fields: readonly string[]) {
  if (!isObject(body)) throw new EnergyMarketInputError('INVALID_MARKET_REQUEST', 'La solicitud debe ser un objeto JSON.');
  const allowed = new Set(fields);
  if (Object.keys(body).some(field => !allowed.has(field))) {
    throw new EnergyMarketInputError('INVALID_MARKET_REQUEST', 'La solicitud contiene campos no permitidos.');
  }
  for (const field of fields) {
    if (!Object.hasOwn(body, field)) {
      throw new EnergyMarketInputError('MISSING_REQUIRED_FIELD', `Falta el campo ${field}.`);
    }
  }
  if (typeof body.deliveryDate !== 'string' || !calendarDate(body.deliveryDate)) {
    throw new EnergyMarketInputError('INVALID_DELIVERY_DATE', 'deliveryDate debe ser una fecha válida con formato YYYY-MM-DD.');
  }
  return body;
}

function validateNotPast(deliveryDate: string, now: Date) {
  if (isPublicationExpired(deliveryDate, businessDateInColombia(now))) {
    throw new EnergyMarketInputError('DELIVERY_DATE_PAST', 'deliveryDate no puede ser anterior a la fecha de negocio actual.');
  }
}

export function validateOfferInput(body: unknown, now = new Date()) {
  const input = validateBody(body, ['quantityKwh', 'pricePerKwh', 'deliveryDate']);
  validateNotPast(input.deliveryDate as string, now);
  return {
    quantityKwh: positiveNumber(input.quantityKwh, 'quantityKwh'),
    pricePerKwh: positiveNumber(input.pricePerKwh, 'pricePerKwh'),
    deliveryDate: input.deliveryDate as string,
  };
}

export function validateDemandInput(body: unknown, now = new Date()) {
  const input = validateBody(body, ['quantityKwh', 'maxPricePerKwh', 'deliveryDate']);
  validateNotPast(input.deliveryDate as string, now);
  return {
    quantityKwh: positiveNumber(input.quantityKwh, 'quantityKwh'),
    maxPricePerKwh: positiveNumber(input.maxPricePerKwh, 'maxPricePerKwh'),
    deliveryDate: input.deliveryDate as string,
  };
}
