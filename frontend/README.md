# EnerTrade AI Frontend

Aplicacion React + TypeScript + Vite para una plataforma de intercambio energetico con soporte de IA.

## Alcance actual

- Dashboard con indicadores y capacidades reportadas por el backend.
- Registro y validación de datasets; consulta de fuentes externas.
- Publicación y consulta de ofertas y demandas propias, con sugerencias de emparejamiento.
- Pronósticos de generación y demanda, y estimación de precio de referencia mediante regla determinista.
- Análisis y consulta de patrones sobre datasets preparados.
- Perfil con la información pública de la sesión.
- Transacciones, cierres comerciales, anomalías y recomendaciones no están disponibles en el prototipo.

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

Las páginas funcionales consumen los endpoints reales mediante los servicios de `src/services/`. Los ejemplos editables de registro están en `src/data/datasetExamples.ts`; no representan resultados ni datos persistidos.
