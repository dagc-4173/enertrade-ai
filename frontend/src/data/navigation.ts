import type { NavigationItem } from '../types/domain'

export const navigationItems: NavigationItem[] = [
  { key: 'dashboard', label: 'Inicio', description: 'Indicadores del motor' },
  { key: 'marketplace', label: 'Mercado', description: 'Publicaciones y mercado activo' },
  { key: 'predictions', label: 'Predicciones', description: 'Generación, demanda y precio' },
  { key: 'transactions', label: 'Transacciones', description: 'Intercambios energéticos simulados' },
  { key: 'patterns', label: 'Patrones', description: 'Análisis y consulta de patrones' },
  { key: 'profile', label: 'Perfil', description: 'Información de sesión' },
]