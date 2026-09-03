import type { DeveloperPrefs } from "./types";

/**
 * Determines whether enough wait-time has elapsed, and prefs allow ads at
 * all, before we even consider requesting a candidate. Pure, no I/O.
 */
export function isEligible(
  command: string,
  prefs: DeveloperPrefs,
  thresholdSec: number,
  elapsedSec: number
): boolean {
  if (!prefs.enabled) return false;
  if (!command || command.trim().length === 0) return false;
  if (thresholdSec < 0) return false;
  return elapsedSec >= thresholdSec;
}
