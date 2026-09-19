import { prisma } from '@/lib/prisma';

type CatalogRow = {
  id: number;
  sourceDatasetId: number;
  profileId: string;
  profileVersion: string;
  sourceRulesetId: string;
  sourceRulesetVersion: string;
  preparedAt: Date;
  content: unknown;
  sourceDataset: { dataType: string };
};

export type PreparedDatasetCatalogItem = {
  id: number;
  sourceDatasetId: number;
  dataType: string;
  profileId: string;
  profileVersion: string;
  sourceRulesetId: string;
  sourceRulesetVersion: string;
  preparedAt: Date;
  recordCount: number;
};

export type PreparedDatasetCatalogStore = {
  findMany(): Promise<CatalogRow[]>;
};

const catalogStore: PreparedDatasetCatalogStore = {
  findMany: () => prisma.preparedDataset.findMany({
    select: {
      id: true, sourceDatasetId: true, profileId: true, profileVersion: true, sourceRulesetId: true,
      sourceRulesetVersion: true, preparedAt: true, content: true, sourceDataset: { select: { dataType: true } },
    },
    orderBy: [{ preparedAt: 'desc' }, { id: 'desc' }],
    take: 100,
  }),
};

function recordCount(content: unknown): number {
  if (!content || typeof content !== 'object' || Array.isArray(content) || !('records' in content) || !Array.isArray(content.records)) {
    throw new Error('Invalid prepared dataset catalog row');
  }
  return content.records.length;
}

export function createPreparedDatasetCatalogService(store: PreparedDatasetCatalogStore = catalogStore) {
  return {
    async list(): Promise<PreparedDatasetCatalogItem[]> {
      const rows = await store.findMany();
      return rows.map(row => ({
        id: row.id, sourceDatasetId: row.sourceDatasetId, dataType: row.sourceDataset.dataType,
        profileId: row.profileId, profileVersion: row.profileVersion, sourceRulesetId: row.sourceRulesetId,
        sourceRulesetVersion: row.sourceRulesetVersion, preparedAt: row.preparedAt, recordCount: recordCount(row.content),
      }));
    },
  };
}

export const preparedDatasetCatalogService = createPreparedDatasetCatalogService();