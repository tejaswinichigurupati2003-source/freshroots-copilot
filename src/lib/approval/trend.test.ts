import { describe, expect, it } from "vitest";
import { salesTrend } from "./trend";

const row = (weeks: [string, number][]) => ({ signals: { recentWeeks: weeks.map(([week, units]) => ({ week, units })) } });

describe("salesTrend", () => {
  it("adds the same week across SKUs and orders the weeks", () => {
    const trend = salesTrend([
      row([["2026-W02", 10], ["2026-W01", 5], ["2026-W03", 20], ["2026-W04", 30], ["2026-W05", 40]]),
      row([["2026-W01", 1], ["2026-W02", 2], ["2026-W03", 3], ["2026-W04", 4], ["2026-W05", 5]]),
    ])!;
    expect(trend.series).toEqual([
      { week: "2026-W01", units: 6 },
      { week: "2026-W02", units: 12 },
      { week: "2026-W03", units: 23 },
      { week: "2026-W04", units: 34 },
      { week: "2026-W05", units: 45 },
    ]);
  });

  it("compares the last four weeks with the average of all weeks", () => {
    const trend = salesTrend([row([["2026-W01", 100], ["2026-W02", 100], ["2026-W03", 100], ["2026-W04", 100], ["2026-W05", 100], ["2026-W06", 100], ["2026-W07", 100], ["2026-W08", 140]])])!;
    expect(trend.avg).toBeCloseTo(105);
    expect(trend.last4Avg).toBeCloseTo(110);
    expect(trend.changePct).toBeCloseTo(4.76, 1);
  });

  it("returns nothing when there are too few weeks to draw a line", () => {
    expect(salesTrend([row([["2026-W01", 5], ["2026-W02", 6]])])).toBeNull();
    expect(salesTrend([])).toBeNull();
  });
});
