/**
 * Money is ALWAYS represented as an integer count of minor currency units
 * (e.g. US cents) plus an explicit ISO-4217 currency code. Never use
 * floating point for money. These helpers centralize the arithmetic so
 * rounding rules live in exactly one place.
 */

export interface Money {
  amountCents: number;
  currency: string;
}

export function money(amountCents: number, currency = "USD"): Money {
  if (!Number.isInteger(amountCents)) {
    throw new TypeError(`amountCents must be an integer, got ${amountCents}`);
  }
  return { amountCents, currency };
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountCents + b.amountCents, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountCents - b.amountCents, a.currency);
}

/** Multiply money by a scalar, rounding to the nearest integer minor unit (half-up). */
export function scaleMoney(a: Money, factor: number): Money {
  return money(Math.round(a.amountCents * factor), a.currency);
}

/**
 * Split `amountCents` between two parties by basis points (1/100 of a
 * percent; 10000 bps = 100%). The remainder from integer rounding is
 * always given to the "primary" party so that primary + secondary ===
 * amountCents exactly (no cents lost or created).
 */
export function splitByBps(amountCents: number, primaryBps: number): { primaryCents: number; secondaryCents: number } {
  if (primaryBps < 0 || primaryBps > 10000) {
    throw new RangeError(`primaryBps must be between 0 and 10000, got ${primaryBps}`);
  }
  const primaryCents = Math.floor((amountCents * primaryBps) / 10000);
  const secondaryCents = amountCents - primaryCents;
  return { primaryCents, secondaryCents };
}

/**
 * Compute the earnings for a single ad impression given the campaign's CPM
 * (cost per 1000 impressions, in cents) and the developer's revenue share
 * in basis points. Returns the developer's cut in integer cents.
 */
export function computeImpressionEarningsCents(cpmCents: number, developerRevenueShareBps: number): number {
  if (!Number.isInteger(cpmCents) || cpmCents < 0) {
    throw new RangeError(`cpmCents must be a non-negative integer, got ${cpmCents}`);
  }
  const costPerImpressionCents = cpmCents / 1000;
  const { primaryCents } = splitByBpsFloat(costPerImpressionCents, developerRevenueShareBps);
  return primaryCents;
}

/** Like splitByBps but accepts a fractional base amount, still returns integer cents (floor). */
function splitByBpsFloat(amountCents: number, primaryBps: number): { primaryCents: number; secondaryCents: number } {
  if (primaryBps < 0 || primaryBps > 10000) {
    throw new RangeError(`primaryBps must be between 0 and 10000, got ${primaryBps}`);
  }
  const primaryCents = Math.floor((amountCents * primaryBps) / 10000);
  const secondaryCents = Math.round(amountCents) - primaryCents;
  return { primaryCents, secondaryCents };
}

export function formatMoney(m: Money, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: m.currency }).format(m.amountCents / 100);
}

const MILLI_CENTS_PER_CENT = 1000;

/**
 * Exact cost of one impression, in milli-cents (1 cent = 1000 milli-cents),
 * given a campaign's CPM (cost per 1000 impressions) in cents.
 * cpmCents / 1000 impressions, converted to milli-cents, is always an
 * integer -- this never needs rounding, unlike the cents-per-impression
 * figure itself (which is usually fractional, e.g. $15 CPM = 1.5 cents).
 */
export function impressionCostMilliCents(cpmCents: number): number {
  if (!Number.isInteger(cpmCents) || cpmCents < 0) {
    throw new RangeError(`cpmCents must be a non-negative integer, got ${cpmCents}`);
  }
  return cpmCents; // (cpmCents / 1000) cents * 1000 milli-cents/cent == cpmCents
}

/**
 * Exact per-impression revenue-share earnings, in milli-cents, given the
 * exact impression cost (in milli-cents) and a basis-points share. Floors
 * at the milli-cent level only (a sub-$0.00001 rounding, not per-cent).
 */
export function impressionEarningsMilliCents(costMilliCents: number, revenueShareBps: number): number {
  if (revenueShareBps < 0 || revenueShareBps > 10000) {
    throw new RangeError(`revenueShareBps must be between 0 and 10000, got ${revenueShareBps}`);
  }
  return Math.floor((costMilliCents * revenueShareBps) / 10000);
}

export interface CarryResolution {
  /** Whole cents that should be recorded as spent/earned right now. */
  wholeCents: number;
  /** Updated carry to persist (fractional milli-cents not yet realized). */
  newCarryMilliCents: number;
}

/**
 * Adds `addMilliCents` to a persisted running carry and peels off however
 * many whole cents that crosses. Called once per impression with the
 * previous persisted carry (read/written inside the same DB transaction as
 * the ledger/spend write, so concurrent impressions serialize correctly via
 * the row lock on the UPDATE), this guarantees the sum of all `wholeCents`
 * returned over time exactly equals floor(total milli-cents / 1000) -- no
 * cent is ever silently lost the way flooring each impression individually
 * would lose it.
 */
export function resolveCarry(previousCarryMilliCents: number, addMilliCents: number): CarryResolution {
  const total = previousCarryMilliCents + addMilliCents;
  const wholeCents = Math.floor(total / MILLI_CENTS_PER_CENT);
  const newCarryMilliCents = total - wholeCents * MILLI_CENTS_PER_CENT;
  return { wholeCents, newCarryMilliCents };
}
