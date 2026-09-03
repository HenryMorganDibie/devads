import { describe, expect, it } from "vitest";
import { CommandTracker } from "../commandTracker";

function fakeClock(startMs: number) {
  let t = startMs;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("CommandTracker", () => {
  it("does not request an ad before the command starts", () => {
    const clock = fakeClock(0);
    const tracker = new CommandTracker(8000, clock.now);
    expect(tracker.shouldRequestAd()).toBe(false);
  });

  it("does not request an ad for a short command that finishes before the threshold", () => {
    const clock = fakeClock(0);
    const tracker = new CommandTracker(8000, clock.now);
    tracker.onCommandStart("npm test");
    clock.advance(2000);
    expect(tracker.shouldRequestAd()).toBe(false); // still under threshold
    tracker.onCommandEnd();
    clock.advance(1000);
    expect(tracker.shouldRequestAd()).toBe(false); // command already ended
  });

  it("becomes eligible once the minimum wait threshold elapses while still running", () => {
    const clock = fakeClock(0);
    const tracker = new CommandTracker(8000, clock.now);
    tracker.onCommandStart("npm run build");
    clock.advance(9000);
    expect(tracker.shouldRequestAd()).toBe(true);
  });

  it("only requests once per command run (does not spam requests every tick)", () => {
    const clock = fakeClock(0);
    const tracker = new CommandTracker(8000, clock.now);
    tracker.onCommandStart("npm run build");
    clock.advance(9000);
    expect(tracker.shouldRequestAd()).toBe(true);
    tracker.markAdRequested();
    clock.advance(5000);
    expect(tracker.shouldRequestAd()).toBe(false);
  });

  it("stops being eligible immediately once the command ends (cancelled or finished)", () => {
    const clock = fakeClock(0);
    const tracker = new CommandTracker(8000, clock.now);
    tracker.onCommandStart("docker build .");
    clock.advance(9000);
    tracker.onCommandEnd();
    expect(tracker.shouldRequestAd()).toBe(false);
    expect(tracker.isStillRunning()).toBe(false);
  });

  it("tracks a new command independently after the previous one ends (failed command handled the same as success)", () => {
    const clock = fakeClock(0);
    const tracker = new CommandTracker(8000, clock.now);
    tracker.onCommandStart("npm run build"); // this one will "fail"
    clock.advance(3000);
    tracker.onCommandEnd();
    expect(tracker.shouldRequestAd()).toBe(false);

    tracker.onCommandStart("npm run build"); // retry
    clock.advance(9000);
    expect(tracker.shouldRequestAd()).toBe(true);
  });

  it("reports elapsed seconds for the currently running command", () => {
    const clock = fakeClock(0);
    const tracker = new CommandTracker(8000, clock.now);
    tracker.onCommandStart("cargo build");
    clock.advance(12500);
    expect(tracker.elapsedSeconds()).toBe(12);
    expect(tracker.currentCommand()).toBe("cargo build");
  });
});
