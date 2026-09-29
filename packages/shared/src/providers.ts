import type { Money } from "./money";

// ---------------------------------------------------------------------------
// PayoutProvider: pays developers out (e.g. Stripe Connect transfers).
// ---------------------------------------------------------------------------

export interface PayoutRequest {
  developerId: string;
  amount: Money;
  destinationRef?: string; // e.g. Stripe Connect account id
}

export interface PayoutResult {
  providerRef: string;
  status: "PENDING" | "PROCESSING" | "PAID" | "FAILED";
  failureReason?: string;
}

export interface PayoutProvider {
  readonly kind: "MOCK" | "STRIPE";
  requestPayout(req: PayoutRequest): Promise<PayoutResult>;
  getPayoutStatus(providerRef: string): Promise<PayoutResult>;
}

// ---------------------------------------------------------------------------
// BillingProvider: charges advertisers (e.g. Stripe customer invoices).
// ---------------------------------------------------------------------------

export interface ChargeRequest {
  advertiserId: string;
  amount: Money;
  customerRef?: string; // e.g. Stripe customer id
  description?: string;
}

export interface ChargeResult {
  providerRef: string;
  status: "SUCCEEDED" | "PENDING" | "FAILED";
  failureReason?: string;
}

export interface BillingProvider {
  readonly kind: "MOCK" | "STRIPE";
  createCustomer(advertiserId: string, email: string): Promise<{ customerRef: string }>;
  charge(req: ChargeRequest): Promise<ChargeResult>;
}

// ---------------------------------------------------------------------------
// MockProvider: deterministic, in-memory, no network. Used by default and
// in demo mode.
// ---------------------------------------------------------------------------

let mockCounter = 0;
function nextMockRef(prefix: string): string {
  mockCounter += 1;
  return `${prefix}_mock_${mockCounter.toString().padStart(6, "0")}`;
}

export class MockPayoutProvider implements PayoutProvider {
  readonly kind = "MOCK" as const;
  private readonly store = new Map<string, PayoutResult>();

  async requestPayout(req: PayoutRequest): Promise<PayoutResult> {
    const ref = nextMockRef("payout");
    const result: PayoutResult = { providerRef: ref, status: "PAID" };
    this.store.set(ref, result);
    return result;
  }

  async getPayoutStatus(providerRef: string): Promise<PayoutResult> {
    const existing = this.store.get(providerRef);
    if (!existing) {
      return { providerRef, status: "FAILED", failureReason: "not_found" };
    }
    return existing;
  }
}

export class MockBillingProvider implements BillingProvider {
  readonly kind = "MOCK" as const;
  private readonly customers = new Map<string, string>();

  async createCustomer(advertiserId: string, _email: string): Promise<{ customerRef: string }> {
    const ref = this.customers.get(advertiserId) ?? nextMockRef("cus");
    this.customers.set(advertiserId, ref);
    return { customerRef: ref };
  }

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    return { providerRef: nextMockRef("ch"), status: "SUCCEEDED" };
  }
}

// ---------------------------------------------------------------------------
// StripeProvider: real Stripe Node SDK, intended for test-mode keys.
// Constructed lazily so the `stripe` package is only required when actually
// selected via env var (BILLING_PROVIDER=stripe / PAYOUT_PROVIDER=stripe).
// ---------------------------------------------------------------------------

export class StripePayoutProvider implements PayoutProvider {
  readonly kind = "STRIPE" as const;
  private stripe: import("stripe").Stripe;

  constructor(secretKey: string) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Stripe = require("stripe");
    this.stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });
  }

  async requestPayout(req: PayoutRequest): Promise<PayoutResult> {
    if (!req.destinationRef) {
      return { providerRef: "", status: "FAILED", failureReason: "missing_destination_ref" };
    }
    try {
      const transfer = await this.stripe.transfers.create({
        amount: req.amount.amountCents,
        currency: req.amount.currency.toLowerCase(),
        destination: req.destinationRef,
      });
      return { providerRef: transfer.id, status: "PROCESSING" };
    } catch (err: any) {
      return { providerRef: "", status: "FAILED", failureReason: err?.message ?? "stripe_error" };
    }
  }

  async getPayoutStatus(providerRef: string): Promise<PayoutResult> {
    try {
      const transfer = await this.stripe.transfers.retrieve(providerRef);
      return { providerRef: transfer.id, status: "PAID" };
    } catch (err: any) {
      return { providerRef, status: "FAILED", failureReason: err?.message ?? "stripe_error" };
    }
  }
}

export class StripeBillingProvider implements BillingProvider {
  readonly kind = "STRIPE" as const;
  private stripe: import("stripe").Stripe;

  constructor(secretKey: string) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Stripe = require("stripe");
    this.stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });
  }

  async createCustomer(advertiserId: string, email: string): Promise<{ customerRef: string }> {
    const customer = await this.stripe.customers.create({ email, metadata: { advertiserId } });
    return { customerRef: customer.id };
  }

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    if (!req.customerRef) {
      return { providerRef: "", status: "FAILED", failureReason: "missing_customer_ref" };
    }
    try {
      const pi = await this.stripe.paymentIntents.create({
        amount: req.amount.amountCents,
        currency: req.amount.currency.toLowerCase(),
        customer: req.customerRef,
        description: req.description,
        confirm: false,
      });
      return { providerRef: pi.id, status: "PENDING" };
    } catch (err: any) {
      return { providerRef: "", status: "FAILED", failureReason: err?.message ?? "stripe_error" };
    }
  }
}

// ---------------------------------------------------------------------------
// Factory: select implementation via env var, default to Mock.
// ---------------------------------------------------------------------------

export function createPayoutProvider(kind: string | undefined, stripeSecretKey?: string): PayoutProvider {
  if (kind === "stripe" && stripeSecretKey) return new StripePayoutProvider(stripeSecretKey);
  return new MockPayoutProvider();
}

export function createBillingProvider(kind: string | undefined, stripeSecretKey?: string): BillingProvider {
  if (kind === "stripe" && stripeSecretKey) return new StripeBillingProvider(stripeSecretKey);
  return new MockBillingProvider();
}

// ---------------------------------------------------------------------------
// RedemptionProvider: turns wallet units of a reward type into something the
// developer can use.
//
// The redemption route (services/ad-server/src/routes/redemptions.ts) follows
// the /api/v1/earnings/payout pattern: per-developer advisory lock, balance
// recomputed from the ledger, a PENDING redemption plus its REDEEMED ledger
// debit written first, then the provider call, then the status from the
// provider result. A FAILED result appends a compensating ADJUSTMENT credit.
//
// Providers never receive anything about the developer beyond their DevAds
// developer id and the redemption itself.
// ---------------------------------------------------------------------------

export interface RedemptionRequest {
  /** DevAds redemption id; stable across retries, so providers can dedupe on it. */
  redemptionId: string;
  developerId: string;
  /** Opaque reward type value (mirrors RewardType); providers declare which they support. */
  rewardType: string;
  amountUnits: number;
}

export interface RedemptionResult {
  providerRef: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  failureReason?: string;
}

export interface RedemptionProvider {
  readonly kind: string;
  supportsRewardType(rewardType: string): boolean;
  redeem(req: RedemptionRequest): Promise<RedemptionResult>;
}

/**
 * Operator-fulfilled redemption. Accepts the request and leaves it PENDING;
 * a DevAds operator delivers the value out of band (for example a credit
 * code a sponsor supplied) and then completes the redemption through the
 * admin API, or fails it, which returns the units to the developer. This is
 * the only production provider today: it needs no third-party integration.
 */
export class ManualRedemptionProvider implements RedemptionProvider {
  readonly kind = "MANUAL" as const;

  supportsRewardType(_rewardType: string): boolean {
    return true;
  }

  async redeem(_req: RedemptionRequest): Promise<RedemptionResult> {
    return { providerRef: "", status: "PENDING" };
  }
}

/**
 * Development and demo only: completes every redemption immediately and
 * delivers nothing. Never select it in a real deployment, because the
 * developer's units are debited for a reward that does not exist.
 */
export class MockRedemptionProvider implements RedemptionProvider {
  readonly kind = "MOCK" as const;

  supportsRewardType(_rewardType: string): boolean {
    return true;
  }

  async redeem(_req: RedemptionRequest): Promise<RedemptionResult> {
    return { providerRef: nextMockRef("redeem"), status: "COMPLETED" };
  }
}

/**
 * Selects the redemption provider from REDEMPTION_PROVIDER. Unlike payouts
 * and billing there is deliberately no default: unset or unrecognised means
 * redemption is disabled (null), so a deployment never debits developer
 * units through a provider nobody chose.
 */
export function createRedemptionProvider(kind: string | undefined): RedemptionProvider | null {
  switch (kind?.trim().toLowerCase()) {
    case "manual":
      return new ManualRedemptionProvider();
    case "mock":
      return new MockRedemptionProvider();
    default:
      return null;
  }
}
