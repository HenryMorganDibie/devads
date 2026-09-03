import { describe, expect, it } from "vitest";
import {
  addMoney,
  computeImpressionEarningsCents,
  formatMoney,
  money,
  scaleMoney,
  splitByBps,
  subtractMoney,
} from "../money.js";

describe("money", () => {
  it("rejects non-integer amounts", () => {
    expect(() => money(1.5)).toThrow(TypeError);
  });

  it("adds and subtracts same-currency amounts", () => {
    expect(addMoney(money(100), money(50))).toEqual(money(150));
    expect(subtractMoney(money(100), money(50))).toEqual(money(50));
  });

  it("throws on currency mismatch", () => {
    expect(() => addMoney(money(100, "USD"), money(50, "EUR"))).toThrow(/Currency mismatch/);
  });

  it("scales and rounds half-up", () => {
    expect(scaleMoney(money(101), 0.5)).toEqual(money(51));
    expect(scaleMoney(money(100), 0.605)).toEqual(money(61));
  });

  it("splits by basis points without losing or creating cents", () => {
    const { primaryCents, secondaryCents } = splitByBps(1000, 6000);
    expect(primaryCents).toBe(600);
    expect(secondaryCents).toBe(400);
    expect(primaryCents + secondaryCents).toBe(1000);
  });

  it("splits odd amounts without losing a cent", () => {
    const { primaryCents, secondaryCents } = splitByBps(1001, 3333);
    expect(primaryCents + secondaryCents).toBe(1001);
  });

  it("rejects out-of-range bps", () => {
    expect(() => splitByBps(1000, -1)).toThrow(RangeError);
    expect(() => splitByBps(1000, 10001)).toThrow(RangeError);
  });

  it("computes per-impression developer earnings from CPM and revshare", () => {
    expect(computeImpressionEarningsCents(1500, 6000)).toBe(0);
    expect(computeImpressionEarningsCents(12000, 6000)).toBe(7);
  });

  it("rejects invalid CPM", () => {
    expect(() => computeImpressionEarningsCents(-1, 6000)).toThrow(RangeError);
  });

  it("formats money using Intl", () => {
    expect(formatMoney(money(150000, "USD"))).toBe("$1,500.00");
  });
});
