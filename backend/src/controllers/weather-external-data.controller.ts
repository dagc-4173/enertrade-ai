import express, { Router, type ErrorRequestHandler } from 'express';
import { NasaPowerWeatherError, NasaPowerWeatherProvider, nasaPowerSupportedTimeStandards, nasaPowerWeatherVariables } from '@/integrations/providers/nasa-power.provider';
import { WeatherExternalDataError, WeatherExternalDataService, type WeatherProviderRegistration } from '@/integrations/weather-external-data.service';

const defaultRegistrations: readonly WeatherProviderRegistration[] = [{
  provider: new NasaPowerWeatherProvider(),
  variables: nasaPowerWeatherVariables,
  supportedTimeStandards: nasaPowerSupportedTimeStandards,
}];

function providerError(error: NasaPowerWeatherError) {
  const statusByCode: Record<string, number> = {
    NASA_POWER_QUERY_INVALID: 400,
    NASA_POWER_VARIABLE_UNSUPPORTED: 400,
    NASA_POWER_TOO_MANY_VARIABLES: 400,
    NASA_POWER_TIMESTAMP_INVALID: 502,
    NASA_POWER_UNITS_INCOMPATIBLE: 502,
    NASA_POWER_RESPONSE_INVALID: 502,
    NASA_POWER_HTTP_ERROR: 502,
    NASA_POWER_NETWORK_ERROR: 502,
    NASA_POWER_TIMEOUT: 504,
  };
  const messageByCode: Record<string, string> = {
    NASA_POWER_QUERY_INVALID: 'La consulta meteorológica no es válida.',
    NASA_POWER_VARIABLE_UNSUPPORTED: 'La variable meteorológica no está soportada.',
    NASA_POWER_TOO_MANY_VARIABLES: 'La consulta supera el máximo de variables permitido.',
    NASA_POWER_TIMESTAMP_INVALID: 'El proveedor devolvió un timestamp inválido.',
    NASA_POWER_UNITS_INCOMPATIBLE: 'El proveedor devolvió unidades no compatibles.',
    NASA_POWER_RESPONSE_INVALID: 'El proveedor devolvió una respuesta no válida.',
    NASA_POWER_HTTP_ERROR: 'No fue posible consultar el proveedor meteorológico.',
    NASA_POWER_NETWORK_ERROR: 'No fue posible establecer comunicación con el proveedor meteorológico.',
    NASA_POWER_TIMEOUT: 'El proveedor meteorológico no respondió a tiempo.',
  };
  return { status: statusByCode[error.code] ?? error.status, error: error.code, message: messageByCode[error.code] ?? 'No fue posible consultar el proveedor meteorológico.' };
}

export function createWeatherExternalDataRouter(service = new WeatherExternalDataService(defaultRegistrations)) {
  const router = Router();
  router.get('/providers', (_req, res) => { res.json({ providers: service.listProviders() }); });
  router.post('/query', (req, res, next) => {
    if (!req.is('application/json')) {
      res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE', message: 'Se requiere Content-Type application/json.' });
      return;
    }
    next();
  }, express.json({ limit: '16kb' }), async (req, res, next) => {
    try { res.json(await service.query(req.body)); } catch (error) { next(error); }
  });
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof WeatherExternalDataError) {
      res.status(error.status).json({ error: error.code, message: error.message });
      return;
    }
    if (error instanceof NasaPowerWeatherError) {
      const mapped = providerError(error);
      res.status(mapped.status).json({ error: mapped.error, message: mapped.message });
      return;
    }
    if (error?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'INVALID_WEATHER_QUERY', message: 'El cuerpo debe contener JSON válido.' });
      return;
    }
    if (error?.status === 413) {
      res.status(413).json({ error: 'WEATHER_QUERY_TOO_LARGE', message: 'La consulta meteorológica supera el tamaño permitido.' });
      return;
    }
    res.status(500).json({ error: 'WEATHER_QUERY_FAILED', message: 'No fue posible consultar los datos meteorológicos.' });
  };
  router.use(handleError);
  return router;
}

export const weatherRouter = createWeatherExternalDataRouter();
