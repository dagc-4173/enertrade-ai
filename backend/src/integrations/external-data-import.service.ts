import { registerDataset } from '@/services/dataset.service';
import type { ExternalDataService } from './external-data.service';
import { ExternalDataError, isObject } from './types/external-data';

export async function importExternalData(input: unknown, service: ExternalDataService) {
  if (!isObject(input) || Object.keys(input).some(key => !['provider', 'dataset', 'startDate', 'endDate'].includes(key))) {
    throw new ExternalDataError(400, 'INVALID_EXTERNAL_QUERY', 'La importación contiene una estructura no admitida.');
  }
  if (input.provider !== 'xm') throw new ExternalDataError(400, 'UNSUPPORTED_PROVIDER', 'El proveedor no está soportado para importación.');
  if (input.dataset !== 'Gene' && input.dataset !== 'DemaSIN' && input.dataset !== 'PrecBolsNaci') throw new ExternalDataError(400, 'UNSUPPORTED_EXTERNAL_DATASET', 'Solo se admite importar Gene, DemaSIN o PrecBolsNaci.');
  const result = await service.query(input);
  if (result.records.length === 0) throw new ExternalDataError(422, 'EXTERNAL_DATA_EMPTY', 'No hay registros para importar en el rango consultado.');
  const price = input.dataset === 'PrecBolsNaci';
  const demand = input.dataset === 'DemaSIN';
  const source = `XM/SINERGOX;metric=${input.dataset};unit=${result.unit};startDate=${result.startDate};endDate=${result.endDate};mapping=${price ? 'xm-preciobolsnaci-v1' : demand ? 'xm-demandasin-v1' : 'xm-gene-v1'}`;
  try {
    return await registerDataset({
      source, dataType: price ? 'precios' : demand ? 'demanda' : 'generacion',
      columns: (price ? ['fecha_xm', 'periodo', 'precio_cop_kwh'] : demand ? ['fecha_xm', 'demanda_kwh'] : ['fecha_xm', 'hora_xm', 'energia_kwh']).map(name => ({ name, optional: false })),
      records: result.records.map(record => price ? {fecha_xm:record.date,periodo:record.hour,precio_cop_kwh:record.value} : demand ? {fecha_xm: record.date, demanda_kwh: record.value} : ({ fecha_xm: record.date, hora_xm: record.hour, energia_kwh: record.value })),
    });
  } catch {
    throw new ExternalDataError(500, 'EXTERNAL_IMPORT_FAILED', 'No fue posible registrar los datos externos.');
  }
}
