import { expect, test } from 'bun:test'
import { parseCapabilityVersions } from '../src/services/capabilityVersionsService'
import { capabilities as fixture } from './fixtures/capabilityModels'

test('current Ridge horizons coexist without ambiguous identities or lost capabilities', () => {
  const capabilities = [
    ...Array.from({ length: 7 }, (_, i) => ({ ...fixture[0]!, id: `xm-gene-ridge-direct-h${i + 1}-v2`, version: '1.0.0-experimental' })),
    ...Array.from({ length: 6 }, (_, i) => ({ ...fixture[1]!, id: `xm-demandasin-ridge-direct-h${i + 1}-v5`, version: 'hu06-demand-v5-c-primary@1.0.0' })),
    ...fixture.slice(2),
  ]
  expect(parseCapabilityVersions({ capabilities })).toHaveLength(16)
  expect(parseCapabilityVersions({ capabilities: [...capabilities, { ...fixture[2]!, artifactType: 'ml_model', id: 'xm-preciobolsnaci-ridge-direct-h4-v1', version: '1.0.0-experimental' }] })).toHaveLength(17)
  expect(() => parseCapabilityVersions({ capabilities: [...capabilities, capabilities[0]] })).toThrow()
  expect(() => parseCapabilityVersions({ capabilities: capabilities.filter(c => c.capability !== 'matching') })).toThrow()
  expect(() => parseCapabilityVersions({ capabilities: [...capabilities, { ...fixture[2]!, id: 'another-price-rule' }] })).toThrow()
})
