export const features = ['energy_same_period_previous_day', 'energy_same_period_7_days_before', 'energy_period24_previous_day', 'sin_2pi_hour_minus1_over24', 'cos_2pi_hour_minus1_over24'] as const;
export const messages = {
  INVALID_FORECAST_REQUEST: 'La solicitud de pronóstico no es válida.',
  PREPARED_DATASET_NOT_FOUND: 'Dataset preparado no encontrado.',
  FORECAST_PROFILE_NOT_APPLICABLE: 'El perfil del dataset no es compatible con el pronóstico.',
  FORECAST_DATA_INSUFFICIENT: 'No hay datos históricos suficientes para pronosticar el día solicitado.',
  FORECAST_DATE_NOT_SUPPORTED: 'La fecha debe ser posterior al periodo de entrenamiento del modelo.',
  PREPARED_DATASET_INCONSISTENT: 'El contenido del dataset preparado es inconsistente.',
  FORECAST_MODEL_INCOMPATIBLE: 'El modelo de pronóstico no está disponible o no es compatible.',
  FORECAST_FAILED: 'No fue posible generar el pronóstico.',
} as const;
export class ForecastError extends Error {
  constructor(public readonly status: number, public readonly code: keyof typeof messages) { super(messages[code]); }
}
export function object(value: unknown): value is Record<string, any> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function calendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
// Calendar arithmetic only; never an observation timestamp.
export function previousDate(value: string, days: number) {
  const d = new Date(value + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10);
}
