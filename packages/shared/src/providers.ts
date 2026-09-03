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
