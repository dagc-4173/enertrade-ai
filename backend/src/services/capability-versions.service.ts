import { loadHourlyRidge } from '@/models/hourly-ridge/model-loader';
import { loadDirectSupplyModel } from '@/models/xm-gene-ridge-direct-v2/model-loader';
import { loadDirectDemandV5Model } from '@/models/xm-demandasin-ridge-direct-v5/model-loader';
import { loadRule, type PriceRule } from '@/models/xm-preciobolsnaci-b1/rule-loader';
import { matchingMethod } from '@/services/matching-method';
import { patternMethod } from '@/services/pattern-analysis.service';

export type CapabilityVersion = {
  capability: 'supply_forecast' | 'demand_forecast' | 'price_estimation' | 'matching' | 'pattern_recognition';
  artifactType: 'ml_model' | 'deterministic_rule' | 'deterministic_method';
  id: string; version: string; status: 'active'; active: true;
  date: null; dateStatus: 'not_recorded';
};

type Loaders = { gene: typeof loadDirectSupplyModel; demand: typeof loadDirectDemandV5Model; price: () => PriceRule };
const defaultLoaders: Loaders = { gene: loadDirectSupplyModel, demand: loadDirectDemandV5Model, price: loadRule };

export function createCapabilityVersionsService(loaders: Loaders = defaultLoaders) {
  return {
    list(): CapabilityVersion[] {
      const price = loaders.price();
      return [
        ...(['demand', 'price'] as const).flatMap(series => (series === 'demand' ? [1,2,3,4,5,6,7] : [4,5,6]).map((h): CapabilityVersion => { const m = loadHourlyRidge(series, h); return { capability: series === 'price' ? 'price_estimation' : 'demand_forecast', artifactType: 'ml_model', id: m.modelId, version: m.modelVersion, status: 'active', active: true, date: null, dateStatus: 'not_recorded' } })),
        ...Array.from({ length: 7 }, (_, i): CapabilityVersion => { const m = loaders.gene(i + 1); return { capability: 'supply_forecast', artifactType: 'ml_model', id: m.modelId, version: m.modelVersion, status: 'active', active: true, date: null, dateStatus: 'not_recorded' } }),
        ...Array.from({ length: 6 }, (_, i): CapabilityVersion => { const m = loaders.demand(i + 1); return { capability: 'demand_forecast', artifactType: 'ml_model', id: m.modelId, version: m.modelVersion, status: 'active', active: true, date: null, dateStatus: 'not_recorded' } }),
        { capability: 'price_estimation', artifactType: 'deterministic_rule', id: price.ruleId, version: price.ruleVersion, status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
        { capability: 'matching', artifactType: matchingMethod.type, id: matchingMethod.id, version: matchingMethod.version, status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
        { capability: 'pattern_recognition', artifactType: 'deterministic_method', id: patternMethod.id, version: patternMethod.version, status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
      ];
    },
  };
}

export const capabilityVersionsService = createCapabilityVersionsService();