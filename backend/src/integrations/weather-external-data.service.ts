import type {
  WeatherDataProvider,
  WeatherDataResult,
  WeatherProviderQuery,
  WeatherTimeStandard,
  WeatherVariable,
} from './types/weather-data';

export type WeatherProviderRegistration = {
  provider: WeatherDataProvider;
  variables: readonly WeatherVariable[];
  supportedTimeStandards: readonly WeatherTimeStandard[];
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
  constructor(private readonly registrations: readonly WeatherProviderRegistration[]) {}

  listProviders() {
    return this.registrations.map(({ provider, variables, supportedTimeStandards }) => ({
      id: provider.id,
      version: provider.version,
      variables: [...variables],
      supportedTimeStandards: [...supportedTimeStandards],
    }));
  }

  async query(input: unknown): Promise<WeatherDataResult> {
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
    return registration.provider.query(query);
  }
}
