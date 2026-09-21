import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import express from 'express';
import { createMatchingRouter } from '@/controllers/matching.controller';
import { buildMatchingSuggestions, createMatchingService, formatDecimal, type MatchingOfferLike, type MatchingDemandLike, type MatchingReadRepository } from '@/services/matching.service';
import { AuthError, type AuthUser } from '@/services/auth.service';
import { requireAuth } from '@/middlewares/auth.middleware';

const user: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'a@example.test',
  name: 'A',
  createdAt: new Date('2026-09-17T00:00:00Z'),
};

const auth = {
  me: async (token?: string) => {
    if (token === 'a') return user;
    throw new AuthError(401, 'UNAUTHENTICATED', 'Debes iniciar sesión.');
  },
};

const isoDate = (value: string) => new Date(`${value}T00:00:00Z`);

function decimal(value: string | number) {
  return { toString: () => String(value) } as any;
}

function first<T>(items: T[]): T {
  expect(items.length).toBeGreaterThan(0);
  return items[0]!;
}

function at<T>(items: T[], index: number): T {
  expect(items.length).toBeGreaterThan(index);
  return items[index]!;
}

describe('buildMatchingSuggestions', () => {
  test('C21a.2: fechas editadas a 2026-10-01 recalculan una coincidencia parcial', () => {
    const offer = { id: 'offer-october', quantityKwh: decimal('30000'), pricePerKwh: decimal('950'), deliveryDate: isoDate('2026-09-30'), createdAt: isoDate('2026-09-21T10:00:00Z'), status: 'ACTIVE' };
    const demand = { id: 'demand-october', quantityKwh: decimal('20000'), maxPricePerKwh: decimal('1000'), deliveryDate: isoDate('2026-10-01'), createdAt: isoDate('2026-09-21T10:01:00Z'), status: 'ACTIVE' };
    expect(buildMatchingSuggestions([offer], [demand]).status).toBe('no_matches');
    offer.deliveryDate = isoDate('2026-10-01');
    const recalculated = buildMatchingSuggestions([offer], [demand]);
    expect(recalculated.status).toBe('matched');
    expect(recalculated.matches).toMatchObject([{ offerId: 'offer-october', demandId: 'demand-october', suggestedQuantityKwh: '20000' }]);
  });

  test('MATCH-DECIMAL-01: formatDecimal conserva enteros y escalas decimales', () => {
    expect(formatDecimal(10000n, 0)).toBe('10000');
    expect(formatDecimal(0n, 0)).toBe('0');
    expect(formatDecimal(123n, 2)).toBe('1.23');
    expect(formatDecimal(12345n, 3)).toBe('12.345');
  });

  test('MATCH-00: cantidades enteras completas conservan el resumen sin fraccion espuria', () => {
    const result = buildMatchingSuggestions(
      [{ id: 'offer-10000', quantityKwh: decimal('10000'), pricePerKwh: decimal('950'), deliveryDate: isoDate('2026-09-23'), createdAt: isoDate('2026-09-16T10:00:00Z'), status: 'ACTIVE' }],
      [{ id: 'demand-10000', quantityKwh: decimal('10000'), maxPricePerKwh: decimal('1000'), deliveryDate: isoDate('2026-09-23'), createdAt: isoDate('2026-09-15T08:00:00Z'), status: 'ACTIVE' }],
    );
    expect(first(result.matches).suggestedQuantityKwh).toBe('10000');
    expect(first(result.demands)).toMatchObject({
      suggestedQuantityKwh: '10000',
      unmatchedQuantityKwh: '0',
      compatibility: 'FULL',
    });
    expect(result.summary.matchedQuantityKwh).toBe('10000');
  });

  test('MATCH-01: una oferta cubre una demanda completamente', () => {
    const offers: MatchingOfferLike[] = [{
      id: 'offer-1',
      quantityKwh: decimal('30.00'),
      pricePerKwh: decimal('400.00000'),
      deliveryDate: isoDate('2026-09-18'),
      createdAt: isoDate('2026-09-16T10:00:00Z'),
      status: 'ACTIVE',
    }];
    const demands: MatchingDemandLike[] = [{
      id: 'demand-1',
      quantityKwh: decimal('30.00'),
      maxPricePerKwh: decimal('450.00000'),
      deliveryDate: isoDate('2026-09-18'),
      createdAt: isoDate('2026-09-15T08:00:00Z'),
      status: 'ACTIVE',
    }];

    const result = buildMatchingSuggestions(offers, demands);
    expect(result.status).toBe('matched');
    expect(result.matches).toHaveLength(1);
    expect(first(result.matches)).toMatchObject({
      offerId: 'offer-1',
      demandId: 'demand-1',
      suggestedQuantityKwh: '30.00',
      offerPricePerKwh: '400.00000',
      maxDemandPricePerKwh: '450.00000',
      deliveryDate: '2026-09-18',
    });
    const firstDemand = first(result.demands);
    expect(firstDemand.compatibility).toBe('FULL');
  });

  test('MATCH-02: oferta insuficiente produce PARTIAL', () => {
    const result = buildMatchingSuggestions(
      [{ id: 'offer-1', quantityKwh: decimal('30.00'), pricePerKwh: decimal('100.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-16T10:00:00Z'), status: 'ACTIVE' }],
      [{ id: 'demand-1', quantityKwh: decimal('60.00'), maxPricePerKwh: decimal('150.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-15T08:00:00Z'), status: 'ACTIVE' }],
    );
    expect(result.status).toBe('partial');
    expect(first(result.matches).suggestedQuantityKwh).toBe('30.00');
    expect(first(result.demands).compatibility).toBe('PARTIAL');
    expect(first(result.demands).suggestedQuantityKwh).toBe('30.00');
    expect(first(result.demands).unmatchedQuantityKwh).toBe('30.00');
  });

  test('MATCH-03: precio superior al máximo produce NO_MATCH', () => {
    const result = buildMatchingSuggestions(
      [{ id: 'offer-1', quantityKwh: decimal('30.00'), pricePerKwh: decimal('500.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-16T10:00:00Z'), status: 'ACTIVE' }],
      [{ id: 'demand-1', quantityKwh: decimal('30.00'), maxPricePerKwh: decimal('450.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-15T08:00:00Z'), status: 'ACTIVE' }],
    );
    expect(result.status).toBe('no_matches');
    expect(result.matches).toHaveLength(0);
    expect(first(result.demands).compatibility).toBe('NO_MATCH');
  });

  test('MATCH-03b: oferta 450 y demanda máxima 412.50 no hacen match automático', () => {
    const result = buildMatchingSuggestions(
      [{ id: 'offer-450', quantityKwh: decimal('50000'), pricePerKwh: decimal('450'), deliveryDate: isoDate('2026-09-23'), createdAt: isoDate('2026-09-21T10:00:00Z'), status: 'ACTIVE' }],
      [{ id: 'demand-412', quantityKwh: decimal('50000'), maxPricePerKwh: decimal('412.50'), deliveryDate: isoDate('2026-09-23'), createdAt: isoDate('2026-09-21T09:00:00Z'), status: 'ACTIVE' }],
    );
    expect(result.status).toBe('no_matches');
    expect(result.matches).toHaveLength(0);
    expect(first(result.demands).compatibility).toBe('NO_MATCH');
  });

  test('MATCH-04: deliveryDate distinta produce NO_MATCH', () => {
    const result = buildMatchingSuggestions(
      [{ id: 'offer-1', quantityKwh: decimal('30.00'), pricePerKwh: decimal('100.00000'), deliveryDate: isoDate('2026-09-19'), createdAt: isoDate('2026-09-16T10:00:00Z'), status: 'ACTIVE' }],
      [{ id: 'demand-1', quantityKwh: decimal('30.00'), maxPricePerKwh: decimal('150.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-15T08:00:00Z'), status: 'ACTIVE' }],
    );
    expect(result.status).toBe('no_matches');
    expect(first(result.demands).compatibility).toBe('NO_MATCH');
  });

  test('MATCH-05: varias ofertas se ordenan por precio', () => {
    const result = buildMatchingSuggestions(
      [
        { id: 'offer-b', quantityKwh: decimal('20.00'), pricePerKwh: decimal('200.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-17T00:00:00Z'), status: 'ACTIVE' },
        { id: 'offer-a', quantityKwh: decimal('20.00'), pricePerKwh: decimal('100.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-16T00:00:00Z'), status: 'ACTIVE' },
      ],
      [{ id: 'demand-1', quantityKwh: decimal('30.00'), maxPricePerKwh: decimal('250.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-15T00:00:00Z'), status: 'ACTIVE' }],
    );
    expect(result.matches.map(item => item.offerId)).toEqual(['offer-a', 'offer-b']);
  });

  test('MATCH-06: una demanda se cubre con varias ofertas', () => {
    const result = buildMatchingSuggestions(
      [
        { id: 'offer-1', quantityKwh: decimal('20.00'), pricePerKwh: decimal('100.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-16T00:00:00Z'), status: 'ACTIVE' },
        { id: 'offer-2', quantityKwh: decimal('20.00'), pricePerKwh: decimal('120.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-16T01:00:00Z'), status: 'ACTIVE' },
      ],
      [{ id: 'demand-1', quantityKwh: decimal('30.00'), maxPricePerKwh: decimal('150.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-15T00:00:00Z'), status: 'ACTIVE' }],
    );
    expect(result.matches).toHaveLength(2);
    expect(result.summary.matchedQuantityKwh).toBe('30.00');
  });

  test('MATCH-07: una oferta se distribuye entre varias demandas', () => {
    const result = buildMatchingSuggestions(
      [{ id: 'offer-1', quantityKwh: decimal('100.00'), pricePerKwh: decimal('110.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-16T00:00:00Z'), status: 'ACTIVE' }],
      [
        { id: 'demand-a', quantityKwh: decimal('60.00'), maxPricePerKwh: decimal('120.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-15T00:00:00Z'), status: 'ACTIVE' },
        { id: 'demand-b', quantityKwh: decimal('50.00'), maxPricePerKwh: decimal('120.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-15T01:00:00Z'), status: 'ACTIVE' },
      ],
    );
    expect(result.matches).toHaveLength(2);
    expect(first(result.matches).suggestedQuantityKwh).toBe('60.00');
    expect(at(result.matches, 1).suggestedQuantityKwh).toBe('40.00');
    expect(at(result.demands, 1).compatibility).toBe('PARTIAL');
  });

  test('MATCH-08: sin ofertas ACTIVE', () => {
    const result = buildMatchingSuggestions([], [{ id: 'demand-1', quantityKwh: decimal('10.00'), maxPricePerKwh: decimal('100.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-15T00:00:00Z'), status: 'ACTIVE' }]);
    expect(result.status).toBe('no_matches');
    expect(result.warnings).toContain('NO_ACTIVE_OFFERS');
    expect(first(result.demands).compatibility).toBe('NO_MATCH');
  });

  test('MATCH-09: sin demandas ACTIVE', () => {
    const result = buildMatchingSuggestions([{ id: 'offer-1', quantityKwh: decimal('10.00'), pricePerKwh: decimal('100.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-16T00:00:00Z'), status: 'ACTIVE' }], []);
    expect(result.status).toBe('no_matches');
    expect(result.warnings).toContain('NO_ACTIVE_DEMANDS');
    expect(result.matches).toHaveLength(0);
  });

  test('MATCH-10: NO_MATCH aparece en demands y no desaparece del resultado', () => {
    const result = buildMatchingSuggestions(
      [{ id: 'offer-1', quantityKwh: decimal('10.00'), pricePerKwh: decimal('100.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-16T00:00:00Z'), status: 'ACTIVE' }],
      [
        { id: 'demand-1', quantityKwh: decimal('10.00'), maxPricePerKwh: decimal('50.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-15T00:00:00Z'), status: 'ACTIVE' },
        { id: 'demand-2', quantityKwh: decimal('10.00'), maxPricePerKwh: decimal('80.00000'), deliveryDate: isoDate('2026-09-19'), createdAt: isoDate('2026-09-15T01:00:00Z'), status: 'ACTIVE' },
      ],
    );
    expect(result.demands).toHaveLength(2);
    expect(result.demands.find(d => d.demandId === 'demand-2')?.compatibility).toBe('NO_MATCH');
  });

  test('MATCH-11: Decimal conserva precisión', () => {
    const result = buildMatchingSuggestions(
      [{ id: 'offer-1', quantityKwh: decimal('12.345'), pricePerKwh: decimal('412.50000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-16T00:00:00Z'), status: 'ACTIVE' }],
      [{ id: 'demand-1', quantityKwh: decimal('12.345'), maxPricePerKwh: decimal('500.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-15T00:00:00Z'), status: 'ACTIVE' }],
    );
    expect(first(result.matches).suggestedQuantityKwh).toBe('12.345');
  });

  test('MATCH-11A: Decimal conserva ceros significativos en cantidades decimales', () => {
    const result = buildMatchingSuggestions(
      [{ id: 'offer-1', quantityKwh: decimal('10000.10'), pricePerKwh: decimal('950'), deliveryDate: isoDate('2026-09-23'), createdAt: isoDate('2026-09-16T10:00:00Z'), status: 'ACTIVE' }],
      [{ id: 'demand-1', quantityKwh: decimal('10000.10'), maxPricePerKwh: decimal('1000'), deliveryDate: isoDate('2026-09-23'), createdAt: isoDate('2026-09-15T08:00:00Z'), status: 'ACTIVE' }],
    );
    expect(first(result.matches).suggestedQuantityKwh).toBe('10000.10');
    expect(first(result.demands)).toMatchObject({ suggestedQuantityKwh: '10000.10', unmatchedQuantityKwh: '0.00', compatibility: 'FULL' });
    expect(result.summary.matchedQuantityKwh).toBe('10000.10');
  });

  test('MATCH-12: createdAt desempata ofertas con mismo precio', () => {
    const result = buildMatchingSuggestions(
      [
        { id: 'offer-late', quantityKwh: decimal('10.00'), pricePerKwh: decimal('100.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-17T10:00:00Z'), status: 'ACTIVE' },
        { id: 'offer-early', quantityKwh: decimal('10.00'), pricePerKwh: decimal('100.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-16T10:00:00Z'), status: 'ACTIVE' },
      ],
      [{ id: 'demand-1', quantityKwh: decimal('10.00'), maxPricePerKwh: decimal('120.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-15T00:00:00Z'), status: 'ACTIVE' }],
    );
    expect(first(result.matches).offerId).toBe('offer-early');
  });

  test('MATCH-13: id desempata mismo precio/createdAt', () => {
    const result = buildMatchingSuggestions(
      [
        { id: 'offer-b', quantityKwh: decimal('10.00'), pricePerKwh: decimal('100.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-16T10:00:00Z'), status: 'ACTIVE' },
        { id: 'offer-a', quantityKwh: decimal('10.00'), pricePerKwh: decimal('100.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-16T10:00:00Z'), status: 'ACTIVE' },
      ],
      [{ id: 'demand-1', quantityKwh: decimal('10.00'), maxPricePerKwh: decimal('120.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-15T00:00:00Z'), status: 'ACTIVE' }],
    );
    expect(first(result.matches).offerId).toBe('offer-a');
  });

  test('MATCH-14: demandas siguen createdAt/id', () => {
    const result = buildMatchingSuggestions(
      [{ id: 'offer-1', quantityKwh: decimal('10.00'), pricePerKwh: decimal('100.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-16T00:00:00Z'), status: 'ACTIVE' }],
      [
        { id: 'demand-b', quantityKwh: decimal('10.00'), maxPricePerKwh: decimal('120.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-17T00:00:00Z'), status: 'ACTIVE' },
        { id: 'demand-a', quantityKwh: decimal('10.00'), maxPricePerKwh: decimal('120.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-16T00:00:00Z'), status: 'ACTIVE' },
      ],
    );
    expect(result.demands.map(d => d.demandId)).toEqual(['demand-a', 'demand-b']);
  });

  test('MATCH-15: misma entrada produce exactamente la misma salida', () => {
    const offers: MatchingOfferLike[] = [
      { id: 'offer-1', quantityKwh: decimal('30.00'), pricePerKwh: decimal('200.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-16T10:00:00Z'), status: 'ACTIVE' },
      { id: 'offer-2', quantityKwh: decimal('40.00'), pricePerKwh: decimal('150.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-16T11:00:00Z'), status: 'ACTIVE' },
    ];
    const demands: MatchingDemandLike[] = [
      { id: 'demand-1', quantityKwh: decimal('50.00'), maxPricePerKwh: decimal('250.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-15T08:00:00Z'), status: 'ACTIVE' },
    ];
    expect(buildMatchingSuggestions(offers, demands)).toEqual(buildMatchingSuggestions(offers, demands));
  });

  test('MATCH-16: no realiza escrituras DB (puede comprobarse con un servicio inerte)', () => {
    const result = buildMatchingSuggestions(
      [{ id: 'offer-1', quantityKwh: decimal('10.00'), pricePerKwh: decimal('100.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-16T10:00:00Z'), status: 'ACTIVE' }],
      [{ id: 'demand-1', quantityKwh: decimal('10.00'), maxPricePerKwh: decimal('120.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-15T08:00:00Z'), status: 'ACTIVE' }],
    );
    expect(result.matches).toHaveLength(1);
    expect(Object.keys(result).sort()).toContain('summary');
  });
});

describe('POST /matches/suggest', () => {
  let offers: MatchingOfferLike[] = [];
  let demands: MatchingDemandLike[] = [];
  let databaseFailure: Error | undefined;
  const repository: MatchingReadRepository = {
    listActiveOffers: async () => {
      if (databaseFailure) throw databaseFailure;
      return offers;
    },
    listActiveDemands: async () => {
      if (databaseFailure) throw databaseFailure;
      return demands;
    },
  };
  const app = express();
  app.use('/matches', createMatchingRouter(createMatchingService(repository), requireAuth(auth)));

  const server = app.listen(0, '127.0.0.1');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected TCP server address.');
  const base = `http://127.0.0.1:${address.port}`;

  afterAll(() => new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  beforeEach(() => {
    offers = [];
    demands = [];
    databaseFailure = undefined;
  });

  test('MATCH-17: endpoint requiere autenticación', async () => {
    const response = await fetch(`${base}/matches/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(response.status).toBe(401);
  });

  test('MATCH-18: body inesperado -> 400', async () => {
    const response = await fetch(`${base}/matches/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'enertrade_session=a' }, body: JSON.stringify({ extra: 'value' }) });
    expect(response.status).toBe(400);
  });

  test('MATCH-19: query inesperada -> 400', async () => {
    const response = await fetch(`${base}/matches/suggest?debug=1`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'enertrade_session=a' } });
    expect(response.status).toBe(400);
  });

  test('MATCH-20: respuesta no expone userId', async () => {
    const response = await fetch(`${base}/matches/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'enertrade_session=a' } });
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain('userId');
  });

  test('MATCH-INFRA-01: repositorio válido sin ofertas devuelve no_matches', async () => {
    demands = [{ id: 'demand-1', quantityKwh: decimal('10.00'), maxPricePerKwh: decimal('120.00000'), deliveryDate: isoDate('2026-09-18'), createdAt: isoDate('2026-09-15T08:00:00Z'), status: 'ACTIVE' }];
    const response = await fetch(`${base}/matches/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'enertrade_session=a' } });
    expect(response.status).toBe(200);
    expect((await response.json() as { status: string }).status).toBe('no_matches');
  });

  test('MATCH-INFRA-02: error de repositorio devuelve 500 controlado', async () => {
    databaseFailure = new Error('database connection failed');
    const response = await fetch(`${base}/matches/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'enertrade_session=a' } });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'MATCHING_OPERATION_FAILED', message: 'No fue posible sugerir emparejamientos.' });
  });
});
