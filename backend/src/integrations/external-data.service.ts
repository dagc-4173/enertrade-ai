import { ExternalDataError, isDate, isObject, type ExternalDataProvider } from './types/external-data';

export class ExternalDataService {
  constructor(private readonly providers: readonly ExternalDataProvider[]) {}

  listProviders() {
    return this.providers.map(provider => ({
      id: provider.id, name: provider.name, datasets: provider.listDatasets(),
    }));
  }

  async query(input: unknown) {
    if (!isObject(input) || Object.keys(input).some(key => !['provider', 'dataset', 'startDate', 'endDate', 'filters'].includes(key))) {
      throw new ExternalDataError(400, 'INVALID_EXTERNAL_QUERY', 'La consulta contiene una estructura no admitida.');
    }
    const provider = this.providers.find(item => item.id === input.provider);
    if (!provider) throw new ExternalDataError(400, 'UNSUPPORTED_PROVIDER', 'El proveedor no está soportado.');
    const dataset = provider.listDatasets().find(item => item.id === input.dataset);
    if (!dataset) throw new ExternalDataError(400, 'UNSUPPORTED_EXTERNAL_DATASET', 'El dataset no está soportado por el proveedor.');
    if (!isDate(input.startDate) || !isDate(input.endDate)) {
      throw new ExternalDataError(400, 'INVALID_EXTERNAL_DATES', 'Las fechas deben ser fechas válidas con formato YYYY-MM-DD.');
    }
    const days = (Date.parse(input.endDate) - Date.parse(input.startDate)) / 86_400_000 + 1;
    if (days < 1 || days > dataset.maxInclusiveDays) {
      throw new ExternalDataError(400, 'INVALID_EXTERNAL_DATE_RANGE', `El rango debe contener entre 1 y ${dataset.maxInclusiveDays} días inclusivos.`);
    }
    // Los datasets iniciales son agregados de Sistema: XM indica "No aplica".
    if (input.filters !== undefined && (!isObject(input.filters) || Object.keys(input.filters).length !== 0)) {
      throw new ExternalDataError(400, 'UNSUPPORTED_EXTERNAL_FILTERS', 'Estos datasets no admiten filtros.');
    }
    return provider.query({ provider: provider.id, dataset: dataset.id, startDate: input.startDate, endDate: input.endDate });
  }
}
