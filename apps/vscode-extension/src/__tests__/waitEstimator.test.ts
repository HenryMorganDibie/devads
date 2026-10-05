import { describe, expect, it } from "vitest";
import { commandKey, WaitEstimator, type DurationStore } from "../waitEstimator";

function memoryStore(): DurationStore & { data: Record<string, number[]> } {
  const s = { data: {} as Record<string, number[]>, get: () => s.data, set: (v: Record<string, number[]>) => void (s.data = v) };
  return s;
}

describe("WaitEstimator", () => {
  it("has no estimate for a command it has never seen, so no video is requested", () => {
    const est = new WaitEstimator(memoryStore());
    expect(est.availableSeconds("npm test", 8)).toBeUndefined();
  });

  it("estimates the time left from the shortest recent run", () => {
    const est = new WaitEstimator(memoryStore());
    for (const d of [42, 30, 35]) est.record("npm test", d);
    expect(est.expectedSeconds("npm test")).toBe(30);
    expect(est.availableSeconds("npm test", 8)).toBe(22);
    expect(est.availableSeconds("npm test", 30)).toBeUndefined();
  });

  it("normalizes whitespace but keeps different commands apart", () => {
    const est = new WaitEstimator(memoryStore());
    est.record("npm  run   build", 20);
    expect(est.expectedSeconds(" npm run build ")).toBe(20);
    expect(est.expectedSeconds("npm run lint")).toBeUndefined();
  });

  it("stores only hashes of commands, never the command text", () => {
    const store = memoryStore();
    new WaitEstimator(store).record("deploy --token=super-secret-value", 12);
    const serialized = JSON.stringify(store.data);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("deploy");
    expect(Object.keys(store.data)).toEqual([commandKey("deploy --token=super-secret-value")]);
  });

  it("keeps a bounded history and ignores trivial or invalid runs", () => {
    const store = memoryStore();
    const est = new WaitEstimator(store);
    for (let i = 0; i < 8; i++) est.record("make", 10 + i);
    expect(store.data[commandKey("make")]).toHaveLength(5);
    est.record("ls", 0);
    est.record("x", Number.NaN);
    expect(est.expectedSeconds("ls")).toBeUndefined();
    for (let i = 0; i < 250; i++) est.record(`cmd-${i}`, 5);
    expect(Object.keys(store.data).length).toBeLessThanOrEqual(200);
  });
});
