import { describe, expect, it } from "vitest";
import { AdRequestContextSchema, CreateCampaignSchema, SignupSchema } from "../dto.js";

describe("schemas", () => {
  it("accepts a valid ad request context", () => {
    const result = AdRequestContextSchema.safeParse({
      developerId: "dev_1",
      command: "npm",
      language: "typescript",
      elapsedSeconds: 12,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative elapsedSeconds", () => {
    const result = AdRequestContextSchema.safeParse({
      developerId: "dev_1",
      elapsedSeconds: -1,
    });
    expect(result.success).toBe(false);
  });

  it("validates campaign creation input and defaults currency", () => {
    const result = CreateCampaignSchema.parse({
      advertiserId: "adv_1",
      name: "Launch",
      cpmCents: 1200,
    });
    expect(result.currency).toBe("USD");
  });

  it("rejects short passwords on signup", () => {
    const result = SignupSchema.safeParse({ email: "a@b.com", password: "short" });
    expect(result.success).toBe(false);
  });
});
