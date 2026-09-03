import { describe, expect, it } from "vitest";
import { isEligibleForAdRequest } from "../eligibility";

const config = { enabled: true, minimumWaitSeconds: 8 };
const baseInput = {
  isSignedIn: true,
  elapsedSeconds: 10,
  alreadyRequestedForThisCommand: false,
  stillRunning: true,
};

describe("isEligibleForAdRequest", () => {
  it("is eligible when every condition is satisfied", () => {
    expect(isEligibleForAdRequest(config, baseInput)).toBe(true);
  });

  it("is never eligible when DevAds is disabled, regardless of other state", () => {
    expect(isEligibleForAdRequest({ ...config, enabled: false }, baseInput)).toBe(false);
  });

  it("is never eligible when signed out", () => {
    expect(isEligibleForAdRequest(config, { ...baseInput, isSignedIn: false })).toBe(false);
  });

  it("is not eligible below the minimum wait threshold", () => {
    expect(isEligibleForAdRequest(config, { ...baseInput, elapsedSeconds: 3 })).toBe(false);
  });

  it("is not eligible once already requested for this command run", () => {
    expect(isEligibleForAdRequest(config, { ...baseInput, alreadyRequestedForThisCommand: true })).toBe(false);
  });

  it("is not eligible once the command has stopped running (finished, failed, or cancelled)", () => {
    expect(isEligibleForAdRequest(config, { ...baseInput, stillRunning: false })).toBe(false);
  });
});
