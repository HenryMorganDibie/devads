import { z } from "zod";

export const CurrencyCodeSchema = z.enum(["USD", "EUR", "GBP", "NGN"]);

export const MoneySchema = z.object({
  amountCents: z.number().int().nonnegative(),
  currency: CurrencyCodeSchema,
});

export const AdSelectRequestSchema = z.object({
  developerId: z.string().min(1),
  installationId: z.string().min(1).optional(),
  command: z.string().min(1).max(200),
  language: z.string().optional(),
  frameworks: z.array(z.string()).optional().default([]),
  runtime: z.string().optional(),
  platform: z.string().optional(),
  country: z.string().length(2).optional(),
  categories: z.array(z.string()).optional().default([]),
  elapsedSeconds: z.number().nonnegative(),
});
export type AdSelectRequest = z.infer<typeof AdSelectRequestSchema>;

export const AdSelectResponseSchema = z.object({
  impressionEventId: z.string(),
  campaignId: z.string(),
  creative: z.object({
    id: z.string(),
    type: z.enum(["IMAGE", "VIDEO"]),
    headline: z.string(),
    body: z.string().nullable(),
    ctaLabel: z.string(),
    ctaUrl: z.string(),
    imageUrl: z.string().nullable(),
  }),
});
export type AdSelectResponse = z.infer<typeof AdSelectResponseSchema>;

export const AdEventTypeSchema = z.enum(["IMPRESSION", "VIEW_COMPLETE", "CLICK", "DISMISS"]);

export const AdEventRequestSchema = z.object({
  eventId: z.string().min(1), // idempotency key, client-generated UUID
  type: AdEventTypeSchema,
  campaignId: z.string().min(1),
  impressionEventId: z.string().min(1).optional(),
  developerId: z.string().min(1),
  viewDurationMs: z.number().int().nonnegative().optional(),
});
export type AdEventRequest = z.infer<typeof AdEventRequestSchema>;

export const CampaignCreateSchema = z.object({
  name: z.string().min(1).max(120),
  cpmCents: z.number().int().positive(),
  currency: CurrencyCodeSchema.default("USD"),
  dailyBudgetCents: z.number().int().positive().optional(),
  totalBudgetCents: z.number().int().positive().optional(),
  targeting: z
    .object({
      languages: z.array(z.string()).default([]),
      frameworks: z.array(z.string()).default([]),
      runtimes: z.array(z.string()).default([]),
      platforms: z.array(z.string()).default([]),
      countries: z.array(z.string()).default([]),
      categories: z.array(z.string()).default([]),
    })
    .optional(),
});
export type CampaignCreateInput = z.infer<typeof CampaignCreateSchema>;

export const DeviceAuthStartResponseSchema = z.object({
  deviceCode: z.string(),
  userCode: z.string(),
  verificationUrl: z.string(),
  expiresInSeconds: z.number().int().positive(),
  pollIntervalSeconds: z.number().int().positive(),
});

export const DeviceAuthPollResponseSchema = z.object({
  status: z.enum(["pending", "approved", "expired"]),
  token: z.string().nullable(),
});

export const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type SignupInput = z.infer<typeof SignupSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const MagicLinkRequestSchema = z.object({
  email: z.string().email(),
});
