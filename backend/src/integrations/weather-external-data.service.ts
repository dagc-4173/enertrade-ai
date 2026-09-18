import type {
  WeatherDataProvider,
  WeatherDataResult,
  WeatherProviderQuery,
  WeatherTimeStandard,
  WeatherVariable,
} from './types/weather-data';
import { createWeatherAcquisitionEnvelope, type WeatherAcquisitionEnvelope } from './weather-evidence';
import { saveWeatherAcquisition } from './weather-evidence-store';

export type WeatherProviderRegistration = {
  provider: WeatherDataProvider;
  variables: readonly WeatherVariable[];
  supportedTimeStandards: readonly WeatherTimeStandard[];
  acquire?: (query: WeatherProviderQuery) => Promise<{ rawBody: string; retrievedAt: string }>;
  normalize?: (rawBody: string, query: WeatherProviderQuery, metadata: { retrievedAt: string }) => WeatherDataResult;
};

export class WeatherExternalDataError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'WeatherExternalDataError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const invalidQuery = (message: string) => new WeatherExternalDataError(400, 'INVALID_WEATHER_QUERY', message);

export class WeatherExternalDataService {
  constructor(private readonly registrations: readonly WeatherProviderRegistration[], private readonly saveEvidence: typeof saveWeatherAcquisition = saveWeatherAcquisition) {}

  listProviders() {
    return this.registrations.map(({ provider, variables, supportedTimeStandards }) => ({
      id: provider.id,
      version: provider.version,
      variables: [...variables],
      supportedTimeStandards: [...supportedTimeStandards],
    }));
  }

  private buildQuery(input: unknown): { registration: WeatherProviderRegistration; query: WeatherProviderQuery } {
    if (!isObject(input) || Object.keys(input).some(key => !['provider', 'coordinates', 'range', 'variables', 'requestedTimeStandard'].includes(key))) {
      throw invalidQuery('La consulta meteorológica contiene propiedades no admitidas.');
    }
    if (typeof input.provider !== 'string') throw invalidQuery('provider debe ser un texto.');
    const registration = this.registrations.find(item => item.provider.id === input.provider);
    if (!registration) throw new WeatherExternalDataError(400, 'UNSUPPORTED_WEATHER_PROVIDER', 'El proveedor meteorológico no está soportado.');
    if (!isObject(input.coordinates)) throw invalidQuery('coordinates debe ser un objeto.');
    if (!isObject(input.range)) throw invalidQuery('range debe ser un objeto.');
    if (!Array.isArray(input.variables)) throw invalidQuery('variables debe ser un array.');
    if (input.requestedTimeStandard !== undefined && typeof input.requestedTimeStandard !== 'string') {
      throw invalidQuery('requestedTimeStandard debe ser un texto.');
    }
    const query: WeatherProviderQuery = {
      coordinates: input.coordinates as WeatherProviderQuery['coordinates'],
      range: input.range as WeatherProviderQuery['range'],
      variables: input.variables as WeatherVariable[],
      ...(input.requestedTimeStandard === undefined ? {} : { requestedTimeStandard: input.requestedTimeStandard as WeatherTimeStandard }),
    };
    return { registration, query };
  }

  async query(input: unknown): Promise<WeatherDataResult> {
    const { registration, query } = this.buildQuery(input);
    return registration.provider.query(query);
  }

  async acquire(input: unknown): Promise<{ envelope: WeatherAcquisitionEnvelope; data: WeatherDataResult }> {
    const { registration, query } = this.buildQuery(input);
    if (!registration.acquire || !registration.normalize) {
      throw new WeatherExternalDataError(500, 'WEATHER_ACQUISITION_UNAVAILABLE', 'La adquisición meteorológica no está disponible para este proveedor.');
    }
    const acquisition = await registration.acquire(query);
    const normalized = registration.normalize(acquisition.rawBody, query, { retrievedAt: acquisition.retrievedAt });
    const envelope = createWeatherAcquisitionEnvelope({ rawBody: acquisition.rawBody, normalized });
    await this.saveEvidence(envelope);
    return { envelope, data: normalized };
  }
}
