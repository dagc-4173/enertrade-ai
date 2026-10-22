export const predictionMethods = {
  supply: [
    { key: 'ridge', name: 'Ridge · horario', description: '24 periodos de generación como aproximación de oferta. Horizonte según los datos disponibles.' },
    { key: 'chronos2', name: 'Chronos-2 · horario', description: '24 periodos con mediana y cuantiles experimentales. Generación agregada del SIN.' },
    { key: 'bolt', name: 'Chronos-Bolt · horario', description: '24 periodos con mediana y cuantiles experimentales. Generación agregada del SIN.' },
  ],
  demand: [
    { key: 'ridge', name: 'Ridge · horario', description: '24 periodos sobre DemaReal. Excluye alumbrado público; no equivale a demanda diaria DemaSIN.' },
    { key: 'chronos2', name: 'Chronos-2 · horario', description: '24 periodos de DemaReal, con mediana y cuantiles experimentales.' },
    { key: 'bolt', name: 'Chronos-Bolt · horario', description: '24 periodos de DemaReal, con mediana y cuantiles experimentales.' },
    { key: 'daily', name: 'Ridge V5 · total diario', description: 'Un total diario de DemaSIN. Fuente y frecuencia diferentes de los modelos horarios.' },
  ],
  price: [
    { key: 'ridge', name: 'Ridge · horario', description: '24 precios de bolsa. Solo horizontes de 4, 5 y 6 días desde el origen publicado.' },
    { key: 'chronos2', name: 'Chronos-2 · horario', description: '24 precios de referencia, con mediana y cuantiles experimentales.' },
    { key: 'bolt', name: 'Chronos-Bolt · horario', description: '24 precios de referencia, con mediana y cuantiles experimentales.' },
    { key: 'b1', name: 'B1 · referencia del día anterior', description: 'Regla determinista: repite el precio del mismo periodo del día anterior. No es un modelo de aprendizaje automático.' },
  ],
} as const

