import { createHash } from "node:crypto";

/**
 * Estimates how long the current terminal wait will last, from how long the
 * same command took on this machine before. Pure and VS Code-API-free (the
 * store is injected), so it is unit-testable.
 *
 * Privacy: commands are keyed by a SHA-256 hash of the normalized command
 * line and kept only in local extension storage. Nothing about the command
 * ever leaves the machine; the only thing sent is the resulting whole number
 * of seconds, which lets the server pick a video that fits the wait.
 *
 * The estimate is deliberately conservative (the shortest recent run, not
 * the average), so a video is never intentionally longer than the wait.
 */

export interface DurationStore {
  get(): Record<string, number[]>;
  set(value: Record<string, number[]>): void;
}

const MAX_SAMPLES = 5;
const MAX_COMMANDS = 200;
const MIN_RECORDED_SECONDS = 1;

export function commandKey(commandLine: string): string {
  return createHash("sha256").update(commandLine.trim().replace(/\s+/g, " ")).digest("hex").slice(0, 32);
}

export class WaitEstimator {
  constructor(private readonly store: DurationStore) {}

  /** Records a finished run of the command. */
  record(commandLine: string, durationSeconds: number): void {
    if (!commandLine.trim() || !Number.isFinite(durationSeconds) || durationSeconds < MIN_RECORDED_SECONDS) return;
    const all = { ...this.store.get() };
    const key = commandKey(commandLine);
    const samples = [...(all[key] ?? []), Math.round(durationSeconds)].slice(-MAX_SAMPLES);
    delete all[key];
    all[key] = samples; // re-insert so the most recently used keys are last
    const keys = Object.keys(all);
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_COMMANDS))) delete all[old];
    this.store.set(all);
  }

  /** Conservative expected duration: the shortest recent run, or undefined with no history. */
  expectedSeconds(commandLine: string): number | undefined {
    const samples = this.store.get()[commandKey(commandLine)];
    if (!samples || samples.length === 0) return undefined;
    return Math.min(...samples);
  }

  /** Whole seconds likely left in this run, or undefined when there is no estimate or it is already over. */
  availableSeconds(commandLine: string, elapsedSeconds: number): number | undefined {
    const expected = this.expectedSeconds(commandLine);
    if (expected === undefined) return undefined;
    const left = Math.floor(expected - elapsedSeconds);
    return left > 0 ? left : undefined;
  }
}
