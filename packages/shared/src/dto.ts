import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared enums (mirrors Prisma enums, kept independent so packages that
// never touch the DB layer don't need to depend on @devads/database).
// ---------------------------------------------------------------------------

export const UserRoleSchema = z.enum(["DEVELOPER", "ADVERTISER", "ADMIN"]);
export type UserRoleDTO = z.infer<typeof UserRoleSchema>;

export const CampaignStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "PAUSED",
  "ARCHIVED",
]);
export type CampaignStatusDTO = z.infer<typeof CampaignStatusSchema>;

export const CreativeTypeSchema = z.enum(["IMAGE", "VIDEO"]);
export type CreativeTypeDTO = z.infer<typeof CreativeTypeSchema>;

export const AdEventTypeSchema = z.enum(["IMPRESSION", "VIEW_COMPLETE", "CLICK", "DISMISS"]);
export type AdEventTypeDTO = z.infer<typeof AdEventTypeSchema>;

// ---------------------------------------------------------------------------
// Ad selection context sent by the extension (never trusted for money math,
// only for eligibility/targeting -- server re-derives everything financial).
// ---------------------------------------------------------------------------

export const AdRequestContextSchema = z.object({
  developerId: z.string().min(1),
  installationId: z.string().min(1).optional(),
  command: z.string().max(64).optional(), // coarse command name only, e.g. "npm", "cargo" -- never full argv
  language: z.string().max(32).optional(),
  framework: z.string().max(32).optional(),
  runtime: z.string().max(32).optional(),
  platform: z.string().max(32).optional(),
  country: z.string().length(2).optional(),
  elapsedSeconds: z.number().int().min(0),
});
export type AdRequestContext = z.infer<typeof AdRequestContextSchema>;

export const AdSelectRequestSchema = z.object({
  context: AdRequestContextSchema,
});
export type AdSelectRequest = z.infer<typeof AdSelectRequestSchema>;

export const AdCandidateSchema = z.object({
  impressionId: z.string(),
  campaignId: z.string(),
  creativeId: z.string(),
  type: CreativeTypeSchema,
  headline: z.string(),
  body: z.string().nullable(),
  ctaLabel: z.string(),
  ctaUrl: z.string().url(),
  eventId: z.string(),
});
export type AdCandidate = z.infer<typeof AdCandidateSchema>;

export const AdSelectResponseSchema = z.object({
  ad: AdCandidateSchema.nullable(),
});
export type AdSelectResponse = z.infer<typeof AdSelectResponseSchema>;

// ---------------------------------------------------------------------------
// Events (impression/click/dismiss/view-complete). Idempotent via eventId.
// ---------------------------------------------------------------------------

export const AdEventRequestSchema = z.object({
  eventId: z.string().min(1),
  type: AdEventTypeSchema,
  impressionId: z.string().optional(),
  campaignId: z.string().min(1),
  developerId: z.string().min(1),
  viewDurationMs: z.number().int().min(0).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type AdEventRequest = z.infer<typeof AdEventRequestSchema>;

// ---------------------------------------------------------------------------
// Campaigns (advertiser dashboard <-> ad-server)
// ---------------------------------------------------------------------------

export const CampaignTargetInputSchema = z.object({
  languages: z.array(z.string()).default([]),
  frameworks: z.array(z.string()).default([]),
  runtimes: z.array(z.string()).default([]),
  platforms: z.array(z.string()).default([]),
  countries: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
});
export type CampaignTargetInput = z.infer<typeof CampaignTargetInputSchema>;

export const CreateCampaignSchema = z.object({
  advertiserId: z.string().min(1),
  name: z.string().min(1).max(200),
  cpmCents: z.number().int().positive(),
  currency: z.string().length(3).default("USD"),
  dailyBudgetCents: z.number().int().positive().optional(),
  totalBudgetCents: z.number().int().positive().optional(),
  targets: CampaignTargetInputSchema.optional(),
});
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  role: UserRoleSchema.default("DEVELOPER"),
});
export type SignupInput = z.infer<typeof SignupSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const DeviceAuthStartSchema = z.object({
  deviceId: z.string().min(1),
  platform: z.string().max(32).optional(),
  extensionVersion: z.string().max(32).optional(),
});
export type DeviceAuthStartInput = z.infer<typeof DeviceAuthStartSchema>;

export const DeviceAuthPollSchema = z.object({
  deviceCode: z.string().min(1),
});
export type DeviceAuthPollInput = z.infer<typeof DeviceAuthPollSchema>;
