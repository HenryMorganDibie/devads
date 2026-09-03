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
