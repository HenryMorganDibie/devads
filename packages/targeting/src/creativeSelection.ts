/**
 * Pure creative selection for VIDEO offers.
 *
 * A VIDEO offer carries one creative per length. For the seconds a
 * qualifying interaction reports as available, the longest creative that
 * fits is served, so a video is never intentionally longer than the time
 * the developer already has (for a WAIT: the time they are already waiting):
 *
 *   available < minimum (10s) or unknown -> no video
 *   10-14s -> 10s, 15-19s -> 15s, 20s+ -> 20s  (for 10/15/20s creatives)
 *
 * "Unknown" includes every interaction that has no time window at all (for
 * example a developer-initiated request), so those only ever get CARD offers.
 */

export interface CreativeOption {
  id: string;
  durationSeconds: number;
}

export const DEFAULT_MIN_VIDEO_WINDOW_SECONDS = 10;

export function selectCreativeForWindow<T extends CreativeOption>(
  creatives: readonly T[],
  availableSeconds: number | undefined,
  minWindowSeconds: number = DEFAULT_MIN_VIDEO_WINDOW_SECONDS
): T | null {
  if (availableSeconds === undefined || !Number.isFinite(availableSeconds)) return null;
  if (availableSeconds < minWindowSeconds) return null;
  let best: T | null = null;
  for (const c of creatives) {
    if (!Number.isInteger(c.durationSeconds) || c.durationSeconds <= 0) continue;
    if (c.durationSeconds > availableSeconds) continue;
    if (!best || c.durationSeconds > best.durationSeconds) best = c;
  }
  return best;
}
