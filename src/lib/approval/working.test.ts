import { describe, expect, it } from "vitest";
import { purchaseValueInr, workingSteps, type WorkingInput } from "./working";

const base: WorkingInput = {
  flag: "STOCKOUT_RISK",
  unitsOnHand: 100,
  openPoUnits: 20,
  effectiveStock: 120,
  avg12: 40,
  avg4: 50,
  festival: false,
  perishability: "Low",
  standardQty: 200,
  recommendedQty: 300,
  unitCostInr: 50,
};
const text = (i: WorkingInput) => workingSteps(i).map((s) => `${s.label}: ${s.text}`);

describe("workingSteps", () => {
  it("shows stock, demand, cover, spike, quantity and value for a spiking stockout", () => {
    expect(text(base)).toEqual([
      "Stock: 100 on hand + 20 on open POs = 120 units.",
      "Weekly demand: 40 a week (12-week average).",
      "Weeks of cover: 120 ÷ 40 = 3 weeks. Limits are 6 to 14 weeks.",
      "Demand spike: Last 4 weeks average 50, 25% above the 12-week average. That is over 20%.",
      "Quantity: 1.5 × standard order of 200 = 300 units.",
      "Purchase value: 300 × ₹50 unit cost = ₹15,000.",
    ]);
  });

  it("applies the festival uplift and perishable limits", () => {
    const lines = text({ ...base, festival: true, perishability: "High", avg4: 40 });
    expect(lines[1]).toBe("Weekly demand: 40 (12-week average) × 1.25 festival month = 50 a week.");
    expect(lines[2]).toBe("Weeks of cover: 120 ÷ 50 = 2.4 weeks. Limits are 3 to 4 weeks (high perishability).");
    expect(lines[3]).toContain("The spike test needs more than 20%");
  });

  it("orders nothing for overstock and gives no value", () => {
    const lines = text({ ...base, flag: "OVERSTOCK_RISK", recommendedQty: 0 });
    expect(lines.at(-1)).toBe("Quantity: Overstock: order nothing and pause the next order.");
  });

  it("explains short history without numbers it does not have", () => {
    expect(workingSteps({ ...base, avg12: null, avg4: null })).toHaveLength(1);
  });

  it("skips the purchase value when no unit cost is on file", () => {
    expect(text({ ...base, unitCostInr: 0 }).some((l) => l.startsWith("Purchase value"))).toBe(false);
  });
});

describe("purchaseValueInr", () => {
  it("is quantity times unit cost, or null for no order or no cost", () => {
    expect(purchaseValueInr(10, 12.5)).toBe(125);
    expect(purchaseValueInr(0, 50)).toBeNull();
    expect(purchaseValueInr(10, 0)).toBeNull();
  });
});
