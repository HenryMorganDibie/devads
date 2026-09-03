/**
 * Pure, VS Code-API-free command lifecycle tracker. One instance per
 * terminal. Decides WHEN it is worth asking the ad server for a
 * candidate -- never delays the command itself, and never asks before the
 * configured minimum wait threshold has elapsed while the command is
 * still running.
 */

export type CommandState = "idle" | "running" | "ended";

export interface TrackedCommand {
  command: string;
  startedAtMs: number;
  state: CommandState;
  adRequested: boolean;
}

export class CommandTracker {
  private current: TrackedCommand | null = null;

  constructor(private readonly minimumWaitMs: number, private readonly now: () => number = Date.now) {}

  onCommandStart(command: string): void {
    this.current = { command, startedAtMs: this.now(), state: "running", adRequested: false };
  }

  onCommandEnd(): void {
    if (this.current) this.current.state = "ended";
  }

  /** True exactly once per running command, the first time the minimum wait has elapsed. */
  shouldRequestAd(): boolean {
    if (!this.current || this.current.state !== "running" || this.current.adRequested) return false;
    const elapsedMs = this.now() - this.current.startedAtMs;
    if (elapsedMs < this.minimumWaitMs) return false;
    return true;
  }

  markAdRequested(): void {
    if (this.current) this.current.adRequested = true;
  }

  /** Whether the command that triggered the current/most recent ad request is still running. */
  isStillRunning(): boolean {
    return this.current?.state === "running";
  }

  elapsedSeconds(): number {
    if (!this.current) return 0;
    return Math.floor((this.now() - this.current.startedAtMs) / 1000);
  }

  currentCommand(): string | null {
    return this.current?.command ?? null;
  }
}
