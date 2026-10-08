import { calendarDate, previousDate } from './forecast.contract';

export const productMaxHorizonDays = 7;

export function candidateFutureDates(currentDate: string, modelMaxHorizonDays: number): string[] {
  if (!calendarDate(currentDate) || !Number.isInteger(modelMaxHorizonDays) || modelMaxHorizonDays < 1) {
    throw new Error('Invalid future forecast window.');
  }
  return Array.from({ length: Math.min(productMaxHorizonDays, modelMaxHorizonDays) },
    (_, index) => previousDate(currentDate, -index - 1));
}

export type AvailabilityReason = 'AVAILABLE' | 'SOURCE_DATA_STALE' | 'INCOMPLETE_SOURCE_DAY' | 'NO_BUILDABLE_ORIGIN' | 'MODEL_HORIZON_LIMIT';
