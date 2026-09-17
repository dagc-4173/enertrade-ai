# EnerTrade AI Frontend

Aplicacion React + TypeScript + Vite para una plataforma de intercambio energetico con soporte de IA.

## Alcance actual

- Dashboard operativo del mercado.
- Publicacion y consulta de ofertas/demandas.
- Predicciones de generacion, consumo y precio dinamico.
- Seguimiento de transacciones y validaciones.
- Deteccion de anomalias y acciones recomendadas.
- Perfil con vista ejecutiva y trazabilidad tecnica.

## Estructura

```txt
src/
  components/
  data/
  pages/
  routes/
  services/
  styles/
  types/
```

## Scripts

```bash
npm run dev
npm run build
npm run lint
```

Predictions consume los endpoints reales del backend mediante `src/services/forecastService.ts` y ExternalDataSources consulta el backend mediante `src/services/externalDataService.ts`. Otras páginas aún pueden conservar datos mockeados en `src/data/mockData.ts`.
