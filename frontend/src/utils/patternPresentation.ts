import type { PreparedDatasetCompatibility } from '../types/preparedDatasets'
export const patternRequirements: PreparedDatasetCompatibility[] = ['gene', 'demandasin', 'preciobolsnaci'].map(name => ({ profileId: `xm_${name}_preparacion_base`, profileVersion: '1.0.0', sourceRulesetId: `xm_${name}_base`, sourceRulesetVersion: '1.0.0' }))
export const patternStatuses = { completed: 'Completado', partial: 'Parcial', no_results: 'Sin resultados' }
export const patternVariables = { energia_kwh: 'Generación (kWh)', demanda_kwh: 'Demanda (kWh)', precio_cop_kwh: 'Precio (COP/kWh)' }
export const patternDirections = { stable: 'Estable', increasing: 'Creciente', decreasing: 'Decreciente' }
export function recurrenceLabel(key: string, grouping: string) {
 if (grouping === '1-24') return `${String(Number(key)-1).padStart(2,'0')}:00–${String(Number(key)).padStart(2,'0')}:00`
 return ({ Monday:'Lunes', Tuesday:'Martes', Wednesday:'Miércoles', Thursday:'Jueves', Friday:'Viernes', Saturday:'Sábado', Sunday:'Domingo' } as Record<string,string>)[key] ?? key
}
