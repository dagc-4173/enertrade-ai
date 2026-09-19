import type { NavigationItem } from '../types/domain'

export const navigationItems: NavigationItem[] = [
  { key: 'dashboard', label: 'Inicio', description: 'Indicadores del motor' },
  { key: 'marketplace', label: 'Mercado', description: 'Ofertas y demandas propias' },
  { key: 'predictions', label: 'Predicciones', description: 'Generación, demanda y precio' },
  { key: 'transactions', label: 'Transacciones', description: 'No disponible en el prototipo' },
  { key: 'patterns', label: 'Patrones', description: 'Análisis y consulta de patrones' },
  { key: 'profile', label: 'Perfil', description: 'Información de sesión' },
]