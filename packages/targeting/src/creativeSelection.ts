/**
 * Pure creative selection for VIDEO offers.
 *
 * A VIDEO offer carries one creative per length. For a reported wait window
 * the longest creative that fits is served, so a video is never
 * intentionally longer than the time the developer is already waiting:
 *
 *   window < minimum (10s) or unknown -> no video
 *   10-14s -> 10s, 15-19s -> 15s, 20s+ -> 20s  (for 10/15/20s creatives)
 */

export interface CreativeOption {
  id: string;
  durationSeconds: number;
}

export const DEFAULT_MIN_VIDEO_WINDOW_SECONDS = 10;

export function selectCreativeForWindow<T extends CreativeOption>(
  creatives: readonly T[],
  availableWaitSeconds: number | undefined,
  minWindowSeconds: number = DEFAULT_MIN_VIDEO_WINDOW_SECONDS
): T | null {
  if (availableWaitSeconds === undefined || !Number.isFinite(availableWaitSeconds)) return null;
  if (availableWaitSeconds < minWindowSeconds) return null;
  let best: T | null = null;
  for (const c of creatives) {
    if (!Number.isInteger(c.durationSeconds) || c.durationSeconds <= 0) continue;
    if (c.durationSeconds > availableWaitSeconds) continue;
    if (!best || c.durationSeconds > best.durationSeconds) best = c;
  }
  return best;
}
