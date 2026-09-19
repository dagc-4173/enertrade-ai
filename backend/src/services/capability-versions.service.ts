import { loadModel as loadGeneModel, type ForecastModel as GeneModel } from '@/models/xm-gene-ridge/model-loader';
import { loadModel as loadDemandModel, type ForecastModel as DemandModel } from '@/models/xm-demandasin-ridge/model-loader';
import { loadRule, type PriceRule } from '@/models/xm-preciobolsnaci-b1/rule-loader';
import { matchingMethod } from '@/services/matching-method';
import { patternMethod } from '@/services/pattern-analysis.service';

export type CapabilityVersion = {
  capability: 'supply_forecast' | 'demand_forecast' | 'price_estimation' | 'matching' | 'pattern_recognition';
  artifactType: 'ml_model' | 'deterministic_rule' | 'deterministic_method';
  id: string; version: string; status: 'active'; active: true;
  date: null; dateStatus: 'not_recorded';
};

type Loaders = { gene: () => GeneModel; demand: () => DemandModel; price: () => PriceRule };
const defaultLoaders: Loaders = { gene: loadGeneModel, demand: loadDemandModel, price: loadRule };

export function createCapabilityVersionsService(loaders: Loaders = defaultLoaders) {
  return {
    list(): CapabilityVersion[] {
      const gene = loaders.gene(); const demand = loaders.demand(); const price = loaders.price();
      return [
        { capability: 'supply_forecast', artifactType: 'ml_model', id: gene.modelId, version: gene.modelVersion, status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
        { capability: 'demand_forecast', artifactType: 'ml_model', id: demand.modelId, version: demand.modelVersion, status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
        { capability: 'price_estimation', artifactType: 'deterministic_rule', id: price.ruleId, version: price.ruleVersion, status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
        { capability: 'matching', artifactType: matchingMethod.type, id: matchingMethod.id, version: matchingMethod.version, status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
        { capability: 'pattern_recognition', artifactType: 'deterministic_method', id: patternMethod.id, version: patternMethod.version, status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
      ];
    },
  };
}

export const capabilityVersionsService = createCapabilityVersionsService();