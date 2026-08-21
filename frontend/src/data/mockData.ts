import type {
  AiRecommendation,
  AnalyticRecommendation,
  EnergyOffer,
  ForecastPoint,
  MetricCardData,
  NavigationItem,
  PatternCardData,
  PatternResult,
  ServiceStatus,
  SmartMatch,
  TraceItem,
  Transaction,
  ValidationCase,
  WorkflowStep,
} from '../types/domain'

export const navigationItems: NavigationItem[] = [
  {
    key: 'dashboard',
    label: 'Inicio',
    description: 'Resumen operativo del mercado',
  },
  {
    key: 'marketplace',
    label: 'Mercado',
    description: 'Ofertas, demandas y emparejamientos',
  },
  {
    key: 'predictions',
    label: 'Predicciones',
    description: 'Generacion, consumo y precios IA',
  },
  {
    key: 'transactions',
    label: 'Transacciones',
    description: 'Operaciones, validaciones y cierres',
  },
  {
    key: 'patterns',
    label: 'Patrones',
    title: 'Reconocimiento de patrones',
    description: 'Tendencias, recurrencias y relaciones',
  },
  {
    key: 'profile',
    label: 'Perfil',
    description: 'Usuario, roles y trazabilidad',
  },
]

export const marketMetrics: MetricCardData[] = [
  {
    title: 'Energia ofertada hoy',
    value: '1.284 kWh',
    delta: '+12%',
    helper: 'Volumen disponible en nodos activos',
    tone: 'success',
  },
  {
    title: 'Demandas activas',
    value: '86',
    delta: '+7%',
    helper: 'Solicitudes abiertas para compra',
    tone: 'info',
  },
  {
    title: 'Precio sugerido IA',
    value: '$412 COP/kWh',
    delta: '-3%',
    helper: 'Rango recomendado para cierre',
    tone: 'success',
  },
  {
    title: 'Patrones identificados',
    value: '4',
    delta: 'Actividad alta',
    helper: 'Tendencias y relaciones en seguimiento',
    tone: 'info',
  },
]

export const aiRecommendations: AiRecommendation[] = [
  {
    title: 'Precio dinamico',
    text: 'Ajustar precio de venta entre $408 y $414 COP/kWh para maximizar probabilidad de cierre.',
    tone: 'success',
  },
  {
    title: 'Emparejamiento',
    text: 'Alta probabilidad de coincidencia en Valle de Aburra durante las proximas 2 horas.',
    tone: 'info',
  },
  {
    title: 'Patron transaccional',
    text: 'Usar recurrencias de consumo para mejorar el emparejamiento de TX-8821.',
    tone: 'warning',
  },
]

export const workflowSteps: WorkflowStep[] = [
  {
    title: 'Registro e ingreso',
    description: 'Acceso por tipo de usuario: cliente, operador, gerente tecnico o gerente general.',
  },
  {
    title: 'Panel principal',
    description: 'Vista consolidada del mercado, indicadores y resultados del motor IA.',
  },
  {
    title: 'Publicar oferta o demanda',
    description: 'Formulario para energia, precio, franja horaria, ubicacion y restricciones.',
  },
  {
    title: 'Emparejamiento inteligente',
    description: 'Sugerencias por afinidad entre oferta, demanda, precio, zona y patrones.',
  },
  {
    title: 'Monitoreo y cierre',
    description: 'Seguimiento de transacciones, patrones, decisiones y trazabilidad.',
  },
]

export const marketOffers: EnergyOffer[] = [
  {
    id: 'OF-201',
    actor: 'Solar Santa Elena',
    type: 'Venta',
    energy: '240 kWh',
    price: '$405',
    time: '10:30 AM',
    zone: 'Antioquia',
    status: 'Activa',
    tone: 'success',
  },
  {
    id: 'OF-202',
    actor: 'EcoGrid Norte',
    type: 'Compra',
    energy: '180 kWh',
    price: '$398',
    time: '10:42 AM',
    zone: 'Norte',
    status: 'Activa',
    tone: 'success',
  },
  {
    id: 'OF-203',
    actor: 'Paneles Medellin',
    type: 'Venta',
    energy: '520 kWh',
    price: '$415',
    time: '11:05 AM',
    zone: 'Valle de Aburra',
    status: 'En revision',
    tone: 'warning',
  },
  {
    id: 'OF-204',
    actor: 'Industria Andes',
    type: 'Compra',
    energy: '300 kWh',
    price: '$409',
    time: '11:18 AM',
    zone: 'Oriente',
    status: 'Activa',
    tone: 'success',
  },
  {
    id: 'OF-205',
    actor: 'Nodo Local 17',
    type: 'Venta',
    energy: '96 kWh',
    price: '$438',
    time: '11:33 AM',
    zone: 'Norte',
    status: 'Bloqueada',
    tone: 'danger',
  },
]

export const userEnergyCards: MetricCardData[] = [
  {
    title: 'Mi energia disponible',
    value: '86 kWh',
    helper: 'Actualizado con lectura mas reciente',
    tone: 'success',
  },
  {
    title: 'Oferta publicada',
    value: '1 activa',
    helper: 'Cierre estimado en 18 min',
    tone: 'info',
  },
  {
    title: 'Ingreso proyectado',
    value: '$34.960',
    helper: 'Segun precio sugerido por IA',
    tone: 'success',
  },
]

export const smartMatches: SmartMatch[] = [
  {
    buyer: 'Comercializadora Norte',
    price: '$414',
    fit: '98%',
    state: 'Recomendada',
    tone: 'success',
  },
  {
    buyer: 'Industria Verde SAS',
    price: '$411',
    fit: '94%',
    state: 'Alta probabilidad',
    tone: 'info',
  },
  {
    buyer: 'Red Local P2P',
    price: '$408',
    fit: '89%',
    state: 'Alternativa',
    tone: 'neutral',
  },
]

export const recentTransactions: Transaction[] = [
  {
    id: 'TX-8821',
    type: 'Venta',
    amount: '24 kWh',
    total: '$9.870',
    status: 'Completada',
    note: 'Cierre automatico con trazabilidad completa',
    tone: 'success',
  },
  {
    id: 'TX-8814',
    type: 'Compra',
    amount: '16 kWh',
    total: '$6.320',
    status: 'En proceso',
    note: 'Pendiente confirmacion de contraparte',
    tone: 'info',
  },
  {
    id: 'TX-8799',
    type: 'Venta',
    amount: '11 kWh',
    total: '$4.466',
    status: 'Completada',
    note: 'Precio dentro del rango IA',
    tone: 'success',
  },
  {
    id: 'TX-9002',
    type: 'Venta',
    amount: '120 kWh',
    total: '$52.560',
    status: 'En revision',
    note: 'Analisis de patrones en curso',
    tone: 'warning',
  },
]

export const operatorStats: MetricCardData[] = [
  {
    title: 'Transacciones en revision',
    value: '12',
    helper: '4 con prioridad operativa alta',
    tone: 'warning',
  },
  {
    title: 'Resultados analiticos',
    value: '7',
    helper: '2 requieren validacion operativa',
    tone: 'info',
  },
  {
    title: 'Ofertas pendientes',
    value: '18',
    helper: 'Publicaciones por validar',
    tone: 'info',
  },
]

export const validationQueue: ValidationCase[] = [
  {
    id: 'VAL-301',
    actor: 'Usuario residencial 245',
    type: 'Oferta de venta',
    priority: 'Baja',
    action: 'Aprobar',
  },
  {
    id: 'VAL-302',
    actor: 'Empresa Solar Sur',
    type: 'Demanda de compra',
    priority: 'Media',
    action: 'Revisar',
  },
  {
    id: 'VAL-303',
    actor: 'Nodo Local 17',
    type: 'Oferta de venta',
    priority: 'Alta',
    action: 'Escalar',
  },
]

export const patronesIdentificados: PatternResult[] = [
  {
    id: 'PAT-01',
    pattern: 'Alta demanda en horario nocturno',
    origin: 'Consumo energetico',
    variable: 'Demanda',
    confidence: '87%',
    relevance: 'Alta',
    description: 'Incremento sostenido de demanda en franjas horarias nocturnas.',
  },
  {
    id: 'PAT-02',
    pattern: 'Incremento de oferta solar en horas pico',
    origin: 'Generacion fotovoltaica',
    variable: 'Oferta',
    confidence: '82%',
    relevance: 'Media',
    description: 'Variacion recurrente de disponibilidad fotovoltaica en horas de mayor actividad.',
  },
  {
    id: 'PAT-03',
    pattern: 'Relacion entre precio y demanda regional',
    origin: 'Transacciones simuladas',
    variable: 'Precio',
    confidence: '78%',
    relevance: 'Alta',
    description: 'Relacion consistente entre variacion de precio y demanda regional.',
  },
]

export const tarjetasPatrones: PatternCardData[] = [
  {
    title: 'Tendencia de precio por zona',
    description: 'Variacion recurrente del precio de referencia en zonas con alta demanda.',
    relevance: 'Alta',
  },
  {
    title: 'Variacion regional de demanda',
    description: 'Incremento sostenido de demanda en franjas horarias nocturnas.',
    relevance: 'Media',
  },
  {
    title: 'Recurrencia en horarios de consumo',
    description: 'Patron repetitivo de consumo entre las 18:00 y 21:00.',
    relevance: 'Alta',
  },
  {
    title: 'Relacion oferta-demanda',
    description: 'Coincidencia recurrente entre disponibilidad energetica y solicitudes de demanda.',
    relevance: 'Media',
  },
]

export const forecastPoints: ForecastPoint[] = [
  { label: '08:00', generation: 48, consumption: 64, price: 418 },
  { label: '10:00', generation: 66, consumption: 72, price: 412 },
  { label: '12:00', generation: 84, consumption: 76, price: 405 },
  { label: '14:00', generation: 91, consumption: 80, price: 402 },
  { label: '16:00', generation: 78, consumption: 88, price: 416 },
  { label: '18:00', generation: 52, consumption: 96, price: 431 },
]

export const techStats: MetricCardData[] = [
  {
    title: 'Disponibilidad del servicio',
    value: '99.4%',
    helper: 'Ultimas 24 horas',
    tone: 'success',
  },
  {
    title: 'Latencia promedio API',
    value: '184 ms',
    helper: 'Dentro del umbral esperado',
    tone: 'info',
  },
  {
    title: 'Modelos activos',
    value: '3',
    helper: 'Prediccion, precio y patrones',
    tone: 'success',
  },
]

export const techServices: ServiceStatus[] = [
  {
    name: 'API de prediccion',
    status: 'Operativa',
    note: 'Consumo estable y tiempos normales',
    tone: 'success',
  },
  {
    name: 'Servicio de pricing',
    status: 'Monitoreo',
    note: 'Ligera variacion frente al baseline',
    tone: 'warning',
  },
  {
    name: 'Reconocimiento de patrones',
    status: 'Analizando',
    note: 'Recurrencias de consumo en nodo 17',
    tone: 'info',
  },
]

export const techTrace: TraceItem[] = [
  {
    item: 'Version modelo prediccion',
    value: 'v1.8.2',
    status: 'Produccion',
  },
  {
    item: 'Version modelo precios',
    value: 'v1.4.1',
    status: 'En seguimiento',
  },
  {
    item: 'Dataset validado',
    value: 'DS-2026-04-17',
    status: 'Aprobado',
  },
]

export const executiveStats: MetricCardData[] = [
  {
    title: 'Transacciones cerradas',
    value: '1.248',
    helper: '+14% frente al periodo anterior',
    tone: 'success',
  },
  {
    title: 'Volumen energetico negociado',
    value: '84.2 MWh',
    helper: 'Acumulado del periodo',
    tone: 'info',
  },
  {
    title: 'Eficiencia de emparejamiento',
    value: '93.1%',
    helper: 'Operaciones cerradas sobre oportunidades',
    tone: 'success',
  },
  {
    title: 'Actividad analitica',
    value: 'Alta',
    helper: 'Relaciones relevantes en seguimiento',
    tone: 'neutral',
  },
]

export const executiveHighlights: MetricCardData[] = [
  {
    title: 'Ingreso proyectado del mercado',
    value: '$48.6 M COP',
    helper: 'Estimacion con tendencia actual',
    tone: 'success',
  },
  {
    title: 'Participantes activos',
    value: '326',
    helper: 'Usuarios residenciales y empresariales',
    tone: 'info',
  },
  {
    title: 'Precio promedio de cierre',
    value: '$409 COP/kWh',
    helper: 'Dentro del rango esperado',
    tone: 'success',
  },
]

export const recomendacionesAnaliticas: AnalyticRecommendation[] = [
  {
    title: 'Ajustar recomendacion de precio',
    priority: 'Alta',
    description: 'Considerar la tendencia de demanda nocturna para mejorar el precio de referencia.',
  },
  {
    title: 'Priorizar emparejamientos compatibles',
    priority: 'Media',
    description: 'Usar patrones de oferta y demanda para sugerir mejores coincidencias.',
  },
  {
    title: 'Revisar comportamiento regional',
    priority: 'Media',
    description: 'Analizar zonas con recurrencias de demanda para futuras simulaciones.',
  },
]

export const executiveDecisions = [
  'Mantener expansion del mercado en nodos con alta tasa de cierre.',
  'Priorizar ajuste del motor de precios para proteger estabilidad comercial.',
  'Impulsar captacion de nuevos oferentes en zonas con deficit de oferta.',
]
