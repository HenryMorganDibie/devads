/**
 * Client-side eligibility engine. This is a first, fast, local gate --
 * the ad-server independently re-validates everything (opt-in, targeting,
 * frequency caps, budget) since the client is never authoritative. But
 * checking locally first means an opted-out or too-fast command never
 * even makes a network request.
 *
 *   command starts
 *        v
 *   is user opted in?
 *        v
 *   is this an eligible process? (not already asked for this run)
 *        v
 *   has minimum wait threshold passed?
 *        v
 *   is the user signed in?
 *        v
 *   -> ask the ad server for a candidate
 */

export interface EligibilityConfig {
  enabled: boolean;
  minimumWaitSeconds: number;
}

export interface EligibilityInput {
  isSignedIn: boolean;
  elapsedSeconds: number;
  alreadyRequestedForThisCommand: boolean;
  stillRunning: boolean;
}

export function isEligibleForAdRequest(config: EligibilityConfig, input: EligibilityInput): boolean {
  if (!config.enabled) return false;
  if (!input.isSignedIn) return false;
  if (!input.stillRunning) return false;
  if (input.alreadyRequestedForThisCommand) return false;
  if (input.elapsedSeconds < config.minimumWaitSeconds) return false;
  return true;
}
