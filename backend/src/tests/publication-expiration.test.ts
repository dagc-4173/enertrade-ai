import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDemandService, type DemandRepository } from '@/services/demand.service';
import { createOfferService, type OfferRepository } from '@/services/offer.service';
import { businessDateInColombia, expireActivePublications, isPublicationExpired } from '@/services/publication-expiration.service';
import { assertNeonC4DisposableDatabase, configureIsolatedIntegrationDatabase } from '../../scripts/integration-safety';
import { createAvailableMatchingReadRepository, createMarketService } from '@/services/market.service';
import { createMatchingTraceService, createTracedMatchingService } from '@/services/matching-trace.service';

const now = () => new Date('2026-09-21T12:00:00.000Z');
const record = { id: 'publication-1', userId: 'user-1', quantityKwh: 1, pricePerKwh: 1, maxPricePerKwh: 1, deliveryDate: new Date('2026-10-01T00:00:00.000Z'), status: 'ACTIVE', createdAt: now(), updatedAt: now() };
const neonHost = `ep-c4-validation.${['neon', 'tech'].join('.')}`;
const alternateNeonHost = ['ep-other-branch', 'neon', 'tech'].join('.');
const c4PrimaryUrl = `postgresql://fixture:synthetic-only@${neonHost}:5432/enertrade_c4_test?sslmode=require`;
const c4ShadowUrl = `postgresql://fixture:synthetic-only@${neonHost}:5432/enertrade_c4_shadow_test?sslmode=require`;
function neonEnvironment(overrides: Record<string, string | undefined> = {}) {
  return {
    DATABASE_URL: 'postgresql://app:synthetic-only@127.0.0.1:55433/enertrade_dev',
    ENERTRADE_INTEGRATION_DATABASE_URL: c4PrimaryUrl,
    VALIDATION_SHADOW_DATABASE_URL: c4ShadowUrl,
    ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE: 'true',
    VALIDATION_ROOT: join(tmpdir(), 'enertrade-c4-unit-test'),
    VALIDATION_RUN_ID: 'unit_test_run',
    ...overrides,
  };
}

describe('C21a.2 expiración de publicaciones', () => {
  test('INTEGRATION-NEON-C4-SAFE: acepta principal/shadow C4 de Neon con marcador y root temporal', () => {
    const environment = neonEnvironment();
    const result = assertNeonC4DisposableDatabase(environment, environment.DATABASE_URL!, environment.ENERTRADE_INTEGRATION_DATABASE_URL!);
    expect(result.primary.database).toBe('enertrade_c4_test');
    expect(result.shadow.database).toBe('enertrade_c4_shadow_test');
    configureIsolatedIntegrationDatabase(environment);
    expect(environment.DATABASE_URL).toBe(c4PrimaryUrl);
  });

  test.each([
    { name: 'Neon production database', overrides: { ENERTRADE_INTEGRATION_DATABASE_URL: `postgresql://fixture:synthetic-only@${neonHost}:5432/enertrade_production?sslmode=require` } },
    { name: 'Neon default neondb', overrides: { ENERTRADE_INTEGRATION_DATABASE_URL: `postgresql://fixture:synthetic-only@${neonHost}:5432/neondb?sslmode=require` } },
    { name: 'missing disposable marker', overrides: { ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE: undefined } },
    { name: 'principal equals shadow', overrides: { VALIDATION_SHADOW_DATABASE_URL: c4PrimaryUrl } },
    { name: 'shadow lacks shadow name', overrides: { VALIDATION_SHADOW_DATABASE_URL: `postgresql://fixture:synthetic-only@${neonHost}:5432/enertrade_c4_test?sslmode=require` } },
    { name: 'principal is habitual identity', overrides: { DATABASE_URL: c4PrimaryUrl } },
    { name: 'root outside temp', overrides: { VALIDATION_ROOT: process.cwd() } },
    { name: 'root is temp itself', overrides: { VALIDATION_ROOT: tmpdir() } },
    { name: 'missing run id', overrides: { VALIDATION_RUN_ID: undefined } },
    { name: 'missing principal target with habitual fallback', overrides: { ENERTRADE_INTEGRATION_DATABASE_URL: undefined } },
    { name: 'remote non-Neon target', overrides: { ENERTRADE_INTEGRATION_DATABASE_URL: 'postgresql://fixture:synthetic-only@db.example.invalid:5432/enertrade_c4_test?sslmode=require' } },
    { name: 'shadow name cannot be used as principal', overrides: { ENERTRADE_INTEGRATION_DATABASE_URL: `postgresql://fixture:synthetic-only@${neonHost}:5432/enertrade_c4_test_shadow?sslmode=require` } },
    { name: 'shadow is habitual identity', overrides: { VALIDATION_SHADOW_DATABASE_URL: 'postgresql://fixture:synthetic-only@127.0.0.1:55433/enertrade_dev' } },
    { name: 'shadow host does not identify same branch endpoint', overrides: { VALIDATION_SHADOW_DATABASE_URL: `postgresql://fixture:synthetic-only@${alternateNeonHost}:5432/enertrade_c4_shadow_test?sslmode=require` } },
  ])('INTEGRATION-NEON-C4-UNSAFE: rechaza $name', ({ overrides }) => {
    const environment = neonEnvironment(overrides);
    const original = { ...environment };
    expect(() => configureIsolatedIntegrationDatabase(environment)).toThrow();
    expect(environment).toEqual(original);
  });

  test('INTEGRATION-NEON-C4-REMOTE-NAME: Neon host válido no basta si la base no está marcada C4', () => {
    const environment = neonEnvironment({ ENERTRADE_INTEGRATION_DATABASE_URL: `postgresql://fixture:synthetic-only@${neonHost}:5432/enertrade_test?sslmode=require` });
    expect(() => configureIsolatedIntegrationDatabase(environment)).toThrow('Neon C4 primary database name');
  });

  test.each(['enertrade_marketplace_test_20261007', 'enertrade_integration_disposable_run', 'example_test', 'example_testing', 'example_disposable', 'enertrade-marketplace-test-run'])('INTEGRATION-SAFE: acepta marca explicita %s sin conectar', name => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      const environment = { DATABASE_URL: 'postgresql://reference:unused@habitual.invalid/neondb', ENERTRADE_INTEGRATION_DATABASE_URL: `postgresql://fixture:unused@${host}:55432/${name}`, ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE: 'true' };
      configureIsolatedIntegrationDatabase(environment);
      expect(environment.DATABASE_URL).toBe(environment.ENERTRADE_INTEGRATION_DATABASE_URL);
    }
  });

  test.each([
    { name: 'production/development', target: 'postgresql://fixture@localhost/enertrade_development' },
    { name: 'unmarked', target: 'postgresql://fixture@localhost/unmarked_database' },
    { name: 'contest', target: 'postgresql://fixture@localhost/enertrade_contest' },
    { name: 'testament', target: 'postgresql://fixture@localhost/enertrade_testament' },
    { name: 'tested', target: 'postgresql://fixture@localhost/enertrade_tested' },
    { name: 'testingground', target: 'postgresql://fixture@localhost/enertrade_testingground' },
    { name: 'remote', target: 'postgresql://fixture@production.invalid/enertrade_test' },
    { name: 'routing database', target: 'postgresql://fixture@localhost/enertrade_test?database=neondb' },
    { name: 'routing host', target: 'postgresql://fixture@localhost/enertrade_test?host=production.invalid' },
    { name: 'routing user', target: 'postgresql://fixture@localhost/enertrade_test?user=other' },
    { name: 'same database endpoint with loopback alias', target: 'postgresql://fixture@127.0.0.1:55432/enertrade_test', normal: 'postgresql://reference@localhost:55432/enertrade_test' },
    { name: 'missing flag', target: 'postgresql://fixture@localhost/enertrade_test', flag: undefined },
    { name: 'false flag', target: 'postgresql://fixture@localhost/enertrade_test', flag: 'false' },
  ])('INTEGRATION-UNSAFE: rechaza $name sin cambiar entorno', value => {
    const environment = { DATABASE_URL: value.normal ?? 'postgresql://reference@habitual.invalid/neondb', ENERTRADE_INTEGRATION_DATABASE_URL: value.target, ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE: 'flag' in value ? value.flag : 'true' };
    const original = { ...environment };
    expect(() => configureIsolatedIntegrationDatabase(environment)).toThrow();
    expect(environment).toEqual(original);
  });

  test('EXP-ISOLATED-04: ofertas, demandas, mercado y matching reciben el efecto acotado', async () => {
    const scope = { userIds: ['fixture-user'] };
    let updates = 0;
    const updateMany = async (args: any) => {
      updates += 1;
      if ('sellerUserId' in args.where) expect(args.where).toMatchObject({ sellerUserId: { in: scope.userIds }, buyerUserId: { in: scope.userIds } });
      else expect(args.where.userId).toEqual({ in: scope.userIds });
    };
    const findMany = async (args: any) => { expect(args.where.userId.in).toEqual(scope.userIds); return []; };
    const database: any = { energyOffer: { updateMany, findMany }, energyDemand: { updateMany, findMany }, energyTransaction: { updateMany } };
    const expire = () => expireActivePublications(database, now(), scope);
    const noGlobalExpire = async () => { throw new Error('Global expiration forbidden'); };
    const offers: OfferRepository = { create: async () => record, findMine: async () => [], findOwn: async () => record, hasBlockingTransaction: async () => false, update: async () => record, cancel: async () => record, expire: noGlobalExpire };
    const demands: DemandRepository = { create: async () => record, findMine: async () => [], findOwn: async () => record, hasBlockingTransaction: async () => false, update: async () => record, cancel: async () => record, expire: noGlobalExpire };
    await createOfferService(offers, now, expire).findMine('fixture-user');
    await createDemandService(demands, now, expire).findMine('fixture-user');
    const market = createMarketService(database, now, scope);
    await market.offers('fixture-user');
    await market.demands('fixture-user');
    const trace = createMatchingTraceService({ create: async () => {}, update: async () => {} });
    await createTracedMatchingService(createAvailableMatchingReadRepository(database, scope), trace, expire).suggest();
    expect(updates).toBe(15);
  });

  test('EXP-ISOLATED-03: compara instancia, base y usuario sin confundir servidores locales', () => {
    const normal = 'postgresql://normal:unused@localhost/enertrade';
    expect(() => configureIsolatedIntegrationDatabase({ DATABASE_URL: normal })).toThrow();
    expect(() => configureIsolatedIntegrationDatabase({ DATABASE_URL: normal, ENERTRADE_INTEGRATION_DATABASE_URL: 'postgres://fixture:unused@localhost:5432/enertrade', ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE: 'true' })).toThrow();
    const localInstances = { DATABASE_URL: 'postgresql://normal:unused@127.0.0.1:55433/enertrade_dev', ENERTRADE_INTEGRATION_DATABASE_URL: 'postgresql://fixture:unused@127.0.0.1:55432/enertrade_test', ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE: 'true' };
    configureIsolatedIntegrationDatabase(localInstances);
    expect(localInstances.DATABASE_URL).toBe(localInstances.ENERTRADE_INTEGRATION_DATABASE_URL);
    expect(() => configureIsolatedIntegrationDatabase({ DATABASE_URL: normal, ENERTRADE_INTEGRATION_DATABASE_URL: 'invalid-secret-configuration', ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE: 'true' })).toThrow('Invalid integration database configuration.');
    expect(() => configureIsolatedIntegrationDatabase({ DATABASE_URL: normal, ENERTRADE_INTEGRATION_DATABASE_URL: 'postgres://fixture:unused@localhost/enertrade_test?database=enertrade', ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE: 'true' })).toThrow('Database routing overrides');
    const environment = { DATABASE_URL: normal, ENERTRADE_INTEGRATION_DATABASE_URL: 'postgresql://fixture:unused@localhost/enertrade_test', ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE: 'true' };
    configureIsolatedIntegrationDatabase(environment);
    expect(environment.DATABASE_URL).toBe(environment.ENERTRADE_INTEGRATION_DATABASE_URL);
  });

  test('EXP-ISOLATED-01: acota publicaciones y ambos participantes, incluso los propietarios relacionados', async () => {
    const users = ['fixture-seller', 'fixture-buyer'];
    const publications = [{ userId: users[0], status: 'ACTIVE' }, { userId: 'external', status: 'ACTIVE' }];
    const transactions = [
      { sellerUserId: users[0], buyerUserId: users[1], offerUserId: users[0], demandUserId: users[1], status: 'PENDING_ACCEPTANCE' },
      { sellerUserId: users[0], buyerUserId: 'external', offerUserId: users[0], demandUserId: 'external', status: 'PENDING_ACCEPTANCE' },
      { sellerUserId: users[0], buyerUserId: users[1], offerUserId: 'external', demandUserId: users[1], status: 'PENDING_ACCEPTANCE' },
    ];
    const updatePublications = async (args: any) => {
      expect(args.where.userId).toEqual({ in: users });
      publications.filter(row => args.where.userId.in.includes(row.userId)).forEach(row => { row.status = args.data.status; });
    };
    await expireActivePublications({
      energyOffer: { updateMany: updatePublications }, energyDemand: { updateMany: updatePublications },
      energyTransaction: { updateMany: async (args: any) => {
        expect(args.where).toMatchObject({ sellerUserId: { in: users }, buyerUserId: { in: users }, offer: { userId: { in: users } }, demand: { userId: { in: users } } });
        transactions.filter(row => args.where.sellerUserId.in.includes(row.sellerUserId) && args.where.buyerUserId.in.includes(row.buyerUserId) && args.where.offer.userId.in.includes(row.offerUserId) && args.where.demand.userId.in.includes(row.demandUserId)).forEach(row => { row.status = args.data.status; });
      } },
    }, now(), { userIds: users });
    expect(publications.map(row => row.status)).toEqual(['EXPIRED', 'ACTIVE']);
    expect(transactions.map(row => row.status)).toEqual(['CANCELLED', 'PENDING_ACCEPTANCE', 'PENDING_ACCEPTANCE']);
  });

  test('EXP-ISOLATED-02: un alcance vacío no degrada a expiración global', async () => {
    const fail = async () => { throw new Error('No writes allowed'); };
    await expireActivePublications({ energyOffer: { updateMany: fail }, energyDemand: { updateMany: fail }, energyTransaction: { updateMany: fail } }, now(), { userIds: [] });
  });

  test('EXP-01: Colombia conserva el día local y solo vence fechas estrictamente anteriores', () => {
    expect(businessDateInColombia(new Date('2026-09-21T04:30:00.000Z'))).toBe('2026-09-20');
    expect(isPublicationExpired('2026-09-20', '2026-09-21')).toBe(true);
    expect(isPublicationExpired('2026-09-21', '2026-09-21')).toBe(false);
    expect(isPublicationExpired('2026-10-01', '2026-09-21')).toBe(false);
  });

  test('EXP-02: la operación central solo actualiza ACTIVE con fecha previa', async () => {
    const updates: unknown[] = [];
    await expireActivePublications({ energyOffer: { updateMany: async args => { updates.push(args); return {}; } }, energyDemand: { updateMany: async args => { updates.push(args); return {}; } } }, now());
    expect(updates).toEqual([
      { where: { status: 'ACTIVE', OR: [{ hour: null, deliveryDate: { lt: new Date('2026-09-21T00:00:00.000Z') } }, { hour: { not: null }, deliveryDate: { lte: new Date('2026-09-21T00:00:00.000Z') } }] }, data: { status: 'EXPIRED' } },
      { where: { status: 'ACTIVE', OR: [{ hour: null, deliveryDate: { lt: new Date('2026-09-21T00:00:00.000Z') } }, { hour: { not: null }, deliveryDate: { lte: new Date('2026-09-21T00:00:00.000Z') } }] }, data: { status: 'EXPIRED' } },
    ]);
  });

  test('EXP-03: fechas pasadas se rechazan; hoy y futuro persisten ACTIVE pero su DTO queda BLOCKED sin verificar', async () => {
    const persistedOffers: typeof record[] = [];
    const persistedDemands: typeof record[] = [];
    const offers: OfferRepository = { create: async data => { const row = { ...record, ...data, pricePerKwh: data.pricePerKwh }; persistedOffers.push(row); return row; }, findMine: async () => [record], findOwn: async () => record, hasBlockingTransaction: async () => false, update: async (_id, data) => ({ ...record, ...data, pricePerKwh: data.pricePerKwh }), cancel: async () => record };
    const demands: DemandRepository = { create: async data => { const row = { ...record, ...data, maxPricePerKwh: data.maxPricePerKwh }; persistedDemands.push(row); return row; }, findMine: async () => [record], findOwn: async () => record, hasBlockingTransaction: async () => false, update: async (_id, data) => ({ ...record, ...data, maxPricePerKwh: data.maxPricePerKwh }), cancel: async () => record };
    const offerService = createOfferService(offers, now);
    const demandService = createDemandService(demands, now);
    await expect(offerService.create('user-1', { quantityKwh: 1, pricePerKwh: 1, deliveryDate: '2026-09-20' })).rejects.toMatchObject({ code: 'DELIVERY_DATE_PAST' });
    await expect(demandService.update('user-1', 'publication-1', { quantityKwh: 1, maxPricePerKwh: 1, deliveryDate: '2026-09-20' })).rejects.toMatchObject({ code: 'DELIVERY_DATE_PAST' });
    expect((await offerService.create('user-1', { quantityKwh: 1, pricePerKwh: 1, deliveryDate: '2026-09-21' })).status).toBe('BLOCKED');
    expect((await demandService.create('user-1', { quantityKwh: 1, maxPricePerKwh: 1, deliveryDate: '2026-10-01' })).status).toBe('BLOCKED');
    expect(persistedOffers.map(row => row.status)).toEqual(['ACTIVE']);
    expect(persistedDemands.map(row => row.status)).toEqual(['ACTIVE']);
    expect(isPublicationExpired(persistedOffers[0]!.deliveryDate.toISOString().slice(0, 10), businessDateInColombia(now()))).toBe(false);
    expect(isPublicationExpired(persistedDemands[0]!.deliveryDate.toISOString().slice(0, 10), businessDateInColombia(now()))).toBe(false);
  });

  test('EXP-04: una publicación vencida se conserva en el historial propio sin acciones mutables', async () => {
    const expired = { ...record, deliveryDate: new Date('2026-09-20T00:00:00.000Z') };
    const offers: OfferRepository = { create: async data => ({ ...record, ...data }), findMine: async () => [expired], findOwn: async () => expired, hasBlockingTransaction: async () => false, update: async () => expired, cancel: async () => expired, expire: async () => { expired.status = 'EXPIRED'; } };
    const service = createOfferService(offers, now);
    expect(await service.findMine('user-1')).toMatchObject([{ status: 'EXPIRED', deliveryDate: '2026-09-20' }]);
    await expect(service.update('user-1', 'publication-1', { quantityKwh: 1, pricePerKwh: 1, deliveryDate: '2026-10-01' })).rejects.toMatchObject({ code: 'PUBLICATION_NOT_EDITABLE' });
    await expect(service.cancel('user-1', 'publication-1')).rejects.toMatchObject({ code: 'PUBLICATION_NOT_CANCELLABLE' });
  });
});