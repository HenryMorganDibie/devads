export interface CommandContext {
  command: string;
  language?: string;
  frameworks?: string[];
  runtime?: string;
  platform?: string;
  country?: string;
  categories?: string[];
}

export interface DeveloperPrefs {
  enabled: boolean;
  categoriesOptOut?: string[]; // categories the developer never wants to see
  frequencyCapOverride?: number; // max impressions/day, overrides campaign default if set & lower
}

/** Identity used for frequency-cap lookups (kept separate from prefs so callers can pass either). */
export interface DeveloperContext {
  developerId: string;
  frequencyCapOverride?: number;
}

export interface CampaignTargetSpec {
  languages: string[];
  frameworks: string[];
  runtimes: string[];
  platforms: string[];
  countries: string[];
  categories: string[];
}

export interface CampaignCandidate {
  campaignId: string;
  creativeId: string;
  cpmCents: number;
  status: "APPROVED" | "PAUSED" | "DRAFT" | "SUBMITTED" | "REJECTED" | "ARCHIVED";
  target: CampaignTargetSpec;
  dailyBudgetCents: number | null; // null = unlimited
  totalBudgetCents: number | null; // null = unlimited
  frequencyCapPerDay: number; // campaign/platform-level default
}

export interface ImpressionHistoryEntry {
  campaignId: string;
  createdAt: Date;
}

export interface FrequencyCapConfig {
  defaultDailyCapPerCampaign: number;
  defaultDailyCapGlobal: number;
}

export interface BudgetUsage {
  spentTodayCents: number;
  spentTotalCents: number;
}
