import { describe, expect, it } from "vitest";
import { evaluateSku, evaluateSkuWithSignals, type SkuInput } from "./engine";

const flat = (value: number, weeks = 12) => Array<number>(weeks).fill(value);

const base: SkuInput = {
  weeklySales: flat(100),
  unitsOnHand: 1000,
  openPoUnits: 0,
  standardQty: 200,
  perishability: "Low",
  isFestivalMonth: false,
};

const withInput = (patch: Partial<SkuInput>): SkuInput => ({ ...base, ...patch });

// 8 weeks at 100 then 4 weeks at 150: avg12 = 116.7, avg4 = 150, ratio 1.29.
const spiky = [...flat(100, 8), ...flat(150, 4)];

describe("rule 2: stockout risk", () => {
  it("orders 1x standard when cover is below 6 weeks", () => {
    const r = evaluateSku(withInput({ unitsOnHand: 500 }));
    expect(r).toMatchObject({ flag: "STOCKOUT_RISK", orderQty: 200, weeksOfCover: 5 });
  });

  it("treats exactly 6 weeks as OK", () => {
    expect(evaluateSku(withInput({ unitsOnHand: 600 })).flag).toBe("OK");
  });
});

describe("rule 3: overstock risk", () => {
  it("orders 0 when cover is above 14 weeks", () => {
    const r = evaluateSku(withInput({ unitsOnHand: 1500 }));
    expect(r).toMatchObject({ flag: "OVERSTOCK_RISK", orderQty: 0 });
  });

  it("treats exactly 14 weeks as OK", () => {
    expect(evaluateSku(withInput({ unitsOnHand: 1400 })).flag).toBe("OK");
  });
});

describe("rule 1: high demand", () => {
  it("orders 1.5x standard when the 4-week average is above 120% of the 12-week average", () => {
    const r = evaluateSku(withInput({ weeklySales: spiky, unitsOnHand: 800 }));
    expect(r).toMatchObject({ flag: "HIGH_DEMAND", orderQty: 300 });
    expect(r.spikeRatio).toBeCloseTo(1.2857, 3);
  });

  it("does not fire at 118%", () => {
    const sales = [...flat(100, 8), ...flat(130, 4)]; // avg12 = 110, avg4 = 130
    expect(evaluateSku(withInput({ weeklySales: sales, unitsOnHand: 800 })).flag).toBe("OK");
  });
});

describe("rule 4: festival uplift", () => {
  it("divides cover by 1.25 in festival months", () => {
    const off = evaluateSku(withInput({ unitsOnHand: 700 }));
    const on = evaluateSku(withInput({ unitsOnHand: 700, isFestivalMonth: true }));
    expect(off).toMatchObject({ flag: "OK", weeksOfCover: 7 });
    expect(on).toMatchObject({ flag: "STOCKOUT_RISK", weeksOfCover: 5.6 });
    expect(on.rulesFired).toContain("RULE_4_FESTIVAL_UPLIFT");
  });

  it("leaves the spike test unchanged (A1)", () => {
    const sales = [...flat(100, 8), ...flat(130, 4)]; // ratio 1.18; x1.25 uplift would wrongly give 1.48
    const r = evaluateSku(withInput({ weeklySales: sales, unitsOnHand: 5000, isFestivalMonth: true }));
    expect(r.spikeRatio).toBeLessThan(1.2);
    expect(r.rulesFired).not.toContain("RULE_1_HIGH_DEMAND");
  });
});

describe("rule 5: perishable limits", () => {
  it("uses 3 to 4 weeks for High perishability", () => {
    const high = withInput({ perishability: "High" });
    expect(evaluateSku({ ...high, unitsOnHand: 350 }).flag).toBe("OK");
    expect(evaluateSku({ ...high, unitsOnHand: 250 }).flag).toBe("STOCKOUT_RISK");
    expect(evaluateSku({ ...high, unitsOnHand: 450 }).flag).toBe("OVERSTOCK_RISK");
  });

  it("applies the general limits to Low perishability at the same stock", () => {
    expect(evaluateSku(withInput({ unitsOnHand: 350 })).flag).toBe("STOCKOUT_RISK");
  });
});

describe("open POs (A2)", () => {
  it("counts open PO units as stock", () => {
    const without = evaluateSku(withInput({ unitsOnHand: 400 }));
    const withPo = evaluateSku(withInput({ unitsOnHand: 400, openPoUnits: 300 }));
    expect(without.flag).toBe("STOCKOUT_RISK");
    expect(withPo).toMatchObject({ flag: "OK", effectiveStock: 700 });
  });
});

describe("priority when two rules fire (A4)", () => {
  it("raises a stockout order to 1.5x on a spike", () => {
    const r = evaluateSku(withInput({ weeklySales: spiky, unitsOnHand: 300 }));
    expect(r).toMatchObject({ flag: "STOCKOUT_RISK", orderQty: 300 });
    expect(r.rulesFired).toEqual(["RULE_2_STOCKOUT_RISK", "RULE_1_HIGH_DEMAND"]);
  });

  it("ranks overstock above a spike and orders 0", () => {
    const r = evaluateSku(withInput({ weeklySales: spiky, unitsOnHand: 3000 }));
    expect(r).toMatchObject({ flag: "OVERSTOCK_RISK", orderQty: 0 });
  });
});

describe("insufficient history (A5)", () => {
  it("returns no automatic flag under 12 weeks", () => {
    const r = evaluateSku(withInput({ weeklySales: flat(50, 3), unitsOnHand: 200 }));
    expect(r).toMatchObject({ flag: "INSUFFICIENT_HISTORY", orderQty: 0, weeksOfCover: null });
  });
});

describe("edge-case signals", () => {
  it("flags short history", () => {
    expect(evaluateSkuWithSignals(withInput({ weeklySales: flat(50, 3) })).signals.shortHistory).toBe(true);
  });

  it("flags a 4-week drop of 25% or more while the flag is OK", () => {
    const sales = [...flat(120, 8), ...flat(80, 4)]; // avg12 = 106.7, avg4 = 80
    const r = evaluateSkuWithSignals(withInput({ weeklySales: sales, unitsOnHand: 1000 }));
    expect(r.flag).toBe("OK");
    expect(r.signals.recentDrop).toBe(true);
  });

  it("does not flag a drop when the flag is not OK", () => {
    const sales = [...flat(120, 8), ...flat(80, 4)];
    expect(evaluateSkuWithSignals(withInput({ weeklySales: sales, unitsOnHand: 300 })).signals.recentDrop).toBe(false);
  });

  it("flags one week above 2.5x the median and reports its index", () => {
    const r = evaluateSkuWithSignals(withInput({ weeklySales: [...flat(70, 11), 240] }));
    expect(r.signals.oneWeekSpikeIndex).toBe(11);
  });

  it("stays quiet on steady sales", () => {
    expect(evaluateSkuWithSignals(base).signals).toEqual({ shortHistory: false, recentDrop: false, oneWeekSpikeIndex: null });
  });
});
