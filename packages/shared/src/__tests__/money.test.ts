import { describe, expect, it } from "vitest";
import {
  addMoney,
  computeImpressionEarningsCents,
  formatMoney,
  impressionCostMilliCents,
  impressionEarningsMilliCents,
  money,
  resolveCarry,
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

  describe("carry-based precision (no cent lost to per-impression flooring)", () => {
    it("impressionCostMilliCents converts CPM to an exact per-impression milli-cent cost", () => {
      // $15 CPM => 1.5 cents/impression => 1500 milli-cents/impression
      expect(impressionCostMilliCents(1500)).toBe(1500);
    });

    it("resolveCarry never loses a fraction across many sub-cent impressions", () => {
      // $1.50 CPM => 1.5 milli-cents... use a CPM whose per-impression cost
      // is a fraction of a cent: 500 cents CPM => 0.5 cents/impression => 500 milli-cents.
      let carry = 0;
      let totalWholeCents = 0;
      for (let i = 0; i < 1000; i++) {
        const { wholeCents, newCarryMilliCents } = resolveCarry(carry, impressionCostMilliCents(500));
        totalWholeCents += wholeCents;
        carry = newCarryMilliCents;
      }
      // 1000 impressions * 0.5 cents = exactly 500 cents, with zero carry left over.
      expect(totalWholeCents).toBe(500);
      expect(carry).toBe(0);
    });

    it("resolveCarry conserves an odd, non-exact total exactly (remainder stays in carry)", () => {
      let carry = 0;
      let totalWholeCents = 0;
      const perImpressionMilliCents = 333; // 0.333 cents/impression, doesn't divide evenly
      for (let i = 0; i < 100; i++) {
        const { wholeCents, newCarryMilliCents } = resolveCarry(carry, perImpressionMilliCents);
        totalWholeCents += wholeCents;
        carry = newCarryMilliCents;
      }
      const expectedTotalMilliCents = 100 * perImpressionMilliCents;
      // What was actually credited (in milli-cents) plus what's left in carry
      // must equal the exact total -- nothing lost, nothing fabricated.
      expect(totalWholeCents * 1000 + carry).toBe(expectedTotalMilliCents);
    });

    it("compounds real per-impression spend across many impressions without the systematic understatement floor() produces", () => {
      // $15 CPM, floor(cpmCents/1000) per impression would record 1 cent
      // every time (understating the true 1.5 cents/impression by half).
      const cpmCents = 1500;
      let carry = 0;
      let totalWholeCents = 0;
      const impressions = 10;
      for (let i = 0; i < impressions; i++) {
        const { wholeCents, newCarryMilliCents } = resolveCarry(carry, impressionCostMilliCents(cpmCents));
        totalWholeCents += wholeCents;
        carry = newCarryMilliCents;
      }
      // True cost: 10 * 1.5 cents = 15 cents exactly.
      expect(totalWholeCents).toBe(15);
    });

    it("impressionEarningsMilliCents computes the developer's exact fractional share", () => {
      const costMilliCents = impressionCostMilliCents(1500); // 1500 milli-cents
      expect(impressionEarningsMilliCents(costMilliCents, 6000)).toBe(900); // 60% of 1500 = 900
    });
  });
});
