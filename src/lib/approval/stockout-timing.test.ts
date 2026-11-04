import { describe, expect, it } from "vitest";
import { daysOfStockLeft, daysText, runOutCheck } from "./stockout-timing";

describe("daysOfStockLeft", () => {
  it("is stock divided by daily demand", () => {
    expect(daysOfStockLeft({ effectiveStock: 100, avg12: 70, festival: false })).toBeCloseTo(10);
  });
  it("uses the festival uplift on demand", () => {
    expect(daysOfStockLeft({ effectiveStock: 125, avg12: 70, festival: true })).toBeCloseTo(10);
  });
  it("is unknown with no sales history or zero demand", () => {
    expect(daysOfStockLeft({ effectiveStock: 100, avg12: null, festival: false })).toBeNull();
    expect(daysOfStockLeft({ effectiveStock: 100, avg12: 0, festival: false })).toBeNull();
  });
});

describe("daysText", () => {
  it("words small and rounded values", () => {
    expect(daysText(0.4)).toBe("under a day");
    expect(daysText(1.2)).toBe("1 day");
    expect(daysText(8.6)).toBe("9 days");
  });
});

describe("runOutCheck", () => {
  it("gives the run-out date and no warning when nothing is on order", () => {
    expect(runOutCheck({ stockAsOf: "2026-10-19", daysLeft: 9.8, arrivals: [] })).toEqual({ runsOutOn: "2026-10-28", lateArrival: null });
  });
  it("warns when the earliest open PO arrives after stock runs out", () => {
    expect(runOutCheck({ stockAsOf: "2026-10-19", daysLeft: 5, arrivals: ["2026-11-10", "2026-11-02"] }).lateArrival).toBe("2026-11-02");
  });
  it("does not warn when a PO arrives in time or has no date", () => {
    expect(runOutCheck({ stockAsOf: "2026-10-19", daysLeft: 20, arrivals: ["2026-10-30"] }).lateArrival).toBeNull();
    expect(runOutCheck({ stockAsOf: "2026-10-19", daysLeft: 5, arrivals: [null] }).lateArrival).toBeNull();
  });
});
