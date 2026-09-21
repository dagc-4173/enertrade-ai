export type MatchingCompatibility = 'FULL' | 'PARTIAL' | 'NO_MATCH';
export type MatchingReason = 'NO_ACTIVE_OFFERS' | 'NO_SAME_DELIVERY_DATE' | 'PRICE_ABOVE_MAX' | 'INSUFFICIENT_AVAILABLE_QUANTITY' | 'FULLY_MATCHED' | 'PARTIALLY_MATCHED';

export type DecimalLike = string | number | { toString(): string };
export type MatchWarning = 'NO_ACTIVE_OFFERS' | 'NO_ACTIVE_DEMANDS' | 'PARTIAL_MATCHES';

export type MatchingOfferLike = {
  id: string;
  quantityKwh: DecimalLike;
  pricePerKwh: DecimalLike;
  deliveryDate: Date | string;
  createdAt: Date | string;
  status: string;
};

export type MatchingDemandLike = {
  id: string;
  quantityKwh: DecimalLike;
  maxPricePerKwh: DecimalLike;
  deliveryDate: Date | string;
  createdAt: Date | string;
  status: string;
};

export type MatchingSuggestion = {
  offerId: string;
  demandId: string;
  suggestedQuantityKwh: string;
  offerPricePerKwh: string;
  maxDemandPricePerKwh: string;
  deliveryDate: string;
};

export type MatchingDemandSummary = {
  demandId: string;
  requestedQuantityKwh: string;
  suggestedQuantityKwh: string;
  unmatchedQuantityKwh: string;
  coveragePercent: number;
  compatibility: MatchingCompatibility;
  reasons: MatchingReason[];
};

export type MatchingSummary = {
  offersConsidered: number;
  demandsConsidered: number;
  suggestedMatches: number;
  matchedQuantityKwh: string;
  unmatchedDemandKwh: string;
};

export type MatchingResponse = {
  status: 'matched' | 'partial' | 'no_matches';
  matches: MatchingSuggestion[];
  demands: MatchingDemandSummary[];
  summary: MatchingSummary;
  warnings: MatchWarning[];
};

function asDateString(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '1970-01-01';
  return date.toISOString().slice(0, 10);
}

function parseTimestamp(value: Date | string): number {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return Number.MAX_SAFE_INTEGER;
  return date.getTime();
}

function decimalToString(value: DecimalLike): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return Number.isFinite(value) ? value.toFixed(10).replace(/\.?0+$/, '').replace(/\.$/, '') : String(value);
  if (value && typeof value === 'object' && typeof value.toString === 'function') return value.toString();
  throw new Error('Invalid decimal value');
}

function decimalScale(value: string): number {
  const normalized = value.trim();
  if (!normalized.includes('.')) return 0;
  return normalized.split('.')[1]?.length ?? 0;
}

function toComparableBigInt(value: string, scale: number): bigint {
  const normalized = value.trim();
  const sign = normalized.startsWith('-') ? -1n : 1n;
  const unsigned = normalized.replace(/^-/, '');
  const [wholePart = '0', fractionPart = ''] = unsigned.split('.');
  const digits = `${wholePart.replace(/^0+(?=\d)/, '') || '0'}${fractionPart.padEnd(scale, '0').slice(0, scale)}`;
  return sign * BigInt(digits === '' ? '0' : digits);
}

function compareDecimal(a: string, b: string): number {
  const scale = Math.max(decimalScale(a), decimalScale(b));
  const left = toComparableBigInt(a, scale);
  const right = toComparableBigInt(b, scale);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function addDecimal(a: string, b: string): string {
  const scale = Math.max(decimalScale(a), decimalScale(b));
  const left = toComparableBigInt(a, scale);
  const right = toComparableBigInt(b, scale);
  return formatDecimal(left + right, scale);
}

function subtractDecimal(a: string, b: string): string {
  const scale = Math.max(decimalScale(a), decimalScale(b));
  const left = toComparableBigInt(a, scale);
  const right = toComparableBigInt(b, scale);
  return formatDecimal(left - right, scale);
}

export function formatDecimal(value: bigint, scale: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const digits = absolute.toString();
  if (scale === 0) return `${negative ? '-' : ''}${digits}`;
  const padded = digits.padStart(scale + 1, '0');
  const whole = padded.slice(0, padded.length - scale) || '0';
  const fraction = padded.slice(-scale).padEnd(scale, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

function minDecimal(a: string, b: string): string {
  return compareDecimal(a, b) <= 0 ? a : b;
}

function decimalIsZero(value: string): boolean {
  return compareDecimal(value, '0') === 0;
}

function sumStringValues(values: string[]): string {
  return values.reduce((total, value) => addDecimal(total, value), '0');
}

function coveragePercent(assigned: string, requested: string): number {
  if (compareDecimal(requested, '0') <= 0) return 0;
  const scale = Math.max(decimalScale(assigned), decimalScale(requested));
  const assignedValue = toComparableBigInt(assigned, scale);
  const requestedValue = toComparableBigInt(requested, scale);
  const hundredths = (assignedValue * 10000n + requestedValue / 2n) / requestedValue;
  return Number(hundredths) / 100;
}

function sortOffers(offers: MatchingOfferLike[]) {
  return [...offers].sort((left, right) => {
    const priceComparison = compareDecimal(decimalToString(left.pricePerKwh), decimalToString(right.pricePerKwh));
    if (priceComparison !== 0) return priceComparison;
    const leftDate = parseTimestamp(left.createdAt);
    const rightDate = parseTimestamp(right.createdAt);
    if (leftDate !== rightDate) return leftDate - rightDate;
    return left.id.localeCompare(right.id);
  });
}

function sortDemands(demands: MatchingDemandLike[]) {
  return [...demands].sort((left, right) => {
    const leftDate = parseTimestamp(left.createdAt);
    const rightDate = parseTimestamp(right.createdAt);
    if (leftDate !== rightDate) return leftDate - rightDate;
    return left.id.localeCompare(right.id);
  });
}

export function buildMatchingSuggestions(offers: MatchingOfferLike[], demands: MatchingDemandLike[]): MatchingResponse {
  const sortedOffers = sortOffers(offers.filter(item => item.status === 'ACTIVE'));
  const sortedDemands = sortDemands(demands.filter(item => item.status === 'ACTIVE'));

  const warnings: MatchWarning[] = [];
  if (sortedOffers.length === 0) warnings.push('NO_ACTIVE_OFFERS');
  if (sortedDemands.length === 0) warnings.push('NO_ACTIVE_DEMANDS');

  const remainingOffer = new Map<string, string>();
  for (const offer of sortedOffers) {
    remainingOffer.set(offer.id, decimalToString(offer.quantityKwh));
  }

  const matches: MatchingSuggestion[] = [];
  const demandResults: MatchingDemandSummary[] = [];

  for (const demand of sortedDemands) {
    let remainingDemand = decimalToString(demand.quantityKwh);
    let assignedTotal = '0';
    const sameDateOffers = sortedOffers.filter(offer => asDateString(offer.deliveryDate) === asDateString(demand.deliveryDate));
    const compatibleOffers = sameDateOffers.filter(offer => compareDecimal(decimalToString(offer.pricePerKwh), decimalToString(demand.maxPricePerKwh)) <= 0);

    for (const offer of sortedOffers) {
      if (!remainingOffer.has(offer.id)) continue;
      const offerDate = asDateString(offer.deliveryDate);
      const demandDate = asDateString(demand.deliveryDate);
      const offerRemaining = remainingOffer.get(offer.id)!;

      if (offerDate !== demandDate) continue;
      if (compareDecimal(decimalToString(offer.pricePerKwh), decimalToString(demand.maxPricePerKwh)) > 0) continue;
      if (decimalIsZero(offerRemaining) || decimalIsZero(remainingDemand)) continue;

      const allocated = minDecimal(offerRemaining, remainingDemand);
      if (compareDecimal(allocated, '0') <= 0) continue;

      matches.push({
        offerId: offer.id,
        demandId: demand.id,
        suggestedQuantityKwh: allocated,
        offerPricePerKwh: decimalToString(offer.pricePerKwh),
        maxDemandPricePerKwh: decimalToString(demand.maxPricePerKwh),
        deliveryDate: demandDate,
      });

      remainingOffer.set(offer.id, subtractDecimal(offerRemaining, allocated));
      remainingDemand = subtractDecimal(remainingDemand, allocated);
      assignedTotal = addDecimal(assignedTotal, allocated);

      if (decimalIsZero(remainingDemand)) break;
    }

    let compatibility: MatchingCompatibility;
    if (compareDecimal(assignedTotal, '0') > 0 && decimalIsZero(remainingDemand)) {
      compatibility = 'FULL';
    } else if (compareDecimal(assignedTotal, '0') > 0) {
      compatibility = 'PARTIAL';
    } else {
      compatibility = 'NO_MATCH';
    }

    const reason: MatchingReason = sortedOffers.length === 0
      ? 'NO_ACTIVE_OFFERS'
      : sameDateOffers.length === 0
        ? 'NO_SAME_DELIVERY_DATE'
        : compatibleOffers.length === 0
          ? 'PRICE_ABOVE_MAX'
          : compatibility === 'FULL'
            ? 'FULLY_MATCHED'
            : compatibility === 'PARTIAL'
              ? 'INSUFFICIENT_AVAILABLE_QUANTITY'
              : 'INSUFFICIENT_AVAILABLE_QUANTITY';
    demandResults.push({
      demandId: demand.id,
      requestedQuantityKwh: decimalToString(demand.quantityKwh),
      suggestedQuantityKwh: assignedTotal,
      unmatchedQuantityKwh: remainingDemand,
      coveragePercent: coveragePercent(assignedTotal, decimalToString(demand.quantityKwh)),
      compatibility,
      reasons: compatibility === 'PARTIAL' ? ['PARTIALLY_MATCHED', reason] : [reason],
    });
  }

  const matchedQuantityKwh = sumStringValues(matches.map(item => item.suggestedQuantityKwh));
  const unmatchedDemandKwh = sumStringValues(demandResults.map(item => item.unmatchedQuantityKwh));

  const allFull = demandResults.length > 0 && demandResults.every(item => item.compatibility === 'FULL');
  const anyAssigned = matches.length > 0;
  const status: MatchingResponse['status'] = 
    sortedDemands.length === 0 || sortedOffers.length === 0 ? 'no_matches' :
    allFull ? 'matched' :
    anyAssigned ? 'partial' : 'no_matches';

  if (status === 'partial' && !warnings.includes('PARTIAL_MATCHES')) warnings.push('PARTIAL_MATCHES');

  return {
    status,
    matches,
    demands: demandResults,
    summary: {
      offersConsidered: sortedOffers.length,
      demandsConsidered: sortedDemands.length,
      suggestedMatches: matches.length,
      matchedQuantityKwh,
      unmatchedDemandKwh,
    },
    warnings,
  };
}

export interface MatchingReadRepository {
  listActiveOffers(): Promise<MatchingOfferLike[]>;
  listActiveDemands(): Promise<MatchingDemandLike[]>;
}

export type MatchingService = {
  suggest(): Promise<MatchingResponse>;
};

export function createMatchingService(repo: MatchingReadRepository): MatchingService {
  return {
    async suggest() {
      const offers = await repo.listActiveOffers();
      const demands = await repo.listActiveDemands();
      return buildMatchingSuggestions(offers, demands);
    },
  };
}
