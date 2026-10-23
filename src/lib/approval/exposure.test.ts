import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildRecommendations } from "../ingest/pipeline";
import { seedData, seedRows } from "../ingest/test-support";
import { exposureInr, rupees } from "./exposure";

const base = { festival: false, perishability: "Low", stockoutLossPerUnit: 10, overstockLossPerUnit: 4 };

describe("exposureInr", () => {
  it("prices the units short of the minimum cover for a stockout", () => {
    // demand 100, minimum 6 weeks = 600, stock 400 -> 200 short x 10
    expect(exposureInr({ ...base, flag: "STOCKOUT_RISK", effectiveStock: 400, avg12: 100 })).toBe(2000);
  });

  it("prices the units above the maximum cover for overstock", () => {
    // maximum 14 weeks = 1400, stock 1600 -> 200 over x 4
    expect(exposureInr({ ...base, flag: "OVERSTOCK_RISK", effectiveStock: 1600, avg12: 100 })).toBe(800);
  });

  it("uses the festival uplift and the perishable limits", () => {
    expect(exposureInr({ ...base, festival: true, flag: "STOCKOUT_RISK", effectiveStock: 400, avg12: 100 })).toBe(3500);
    expect(exposureInr({ ...base, perishability: "High", flag: "OVERSTOCK_RISK", effectiveStock: 500, avg12: 100 })).toBe(400);
  });

  it("is zero for OK, high demand, missing history and never negative", () => {
    expect(exposureInr({ ...base, flag: "OK", effectiveStock: 800, avg12: 100 })).toBe(0);
    expect(exposureInr({ ...base, flag: "HIGH_DEMAND", effectiveStock: 800, avg12: 100 })).toBe(0);
    expect(exposureInr({ ...base, flag: "INSUFFICIENT_HISTORY", effectiveStock: 200, avg12: null })).toBe(0);
    expect(exposureInr({ ...base, flag: "STOCKOUT_RISK", effectiveStock: 900, avg12: 100 })).toBe(0);
  });
});

describe("exposure against the answer key", () => {
  const expected = parse(readFileSync(path.resolve(process.cwd(), "data/expected/expected_results.csv"), "utf8"), { columns: true, skip_empty_lines: true }) as {
    SKU_ID: string;
    Indicative_Exposure_INR: string;
  }[];
  const data = seedData();
  const economics = seedRows<{ sku_id: string; stockout_loss_per_unit_inr: number; overstock_loss_per_unit_inr: number }>("sku_economics");
  const recs = buildRecommendations("2026-10-19", data);

  const exposureFor = (skuId: string) => {
    const rec = recs.find((r) => r.sku_id === skuId)!;
    const sku = data.skus.find((s) => s.sku_id === skuId)!;
    const econ = economics.find((e) => e.sku_id === skuId)!;
    const signals = rec.signals as { avg12: number | null; isFestivalMonth: boolean };
    return exposureInr({
      flag: rec.flag,
      effectiveStock: rec.effective_stock,
      avg12: signals.avg12,
      festival: signals.isFestivalMonth,
      perishability: sku.perishability,
      stockoutLossPerUnit: econ.stockout_loss_per_unit_inr,
      overstockLossPerUnit: econ.overstock_loss_per_unit_inr,
    });
  };

  it.each(expected.map((e) => [e.SKU_ID, Number(e.Indicative_Exposure_INR)] as const))("%s matches the key", (skuId, expectedValue) => {
    expect(exposureFor(skuId)).toBe(expectedValue);
  });

  it("totals ₹24,388 across the 18 SKUs", () => {
    expect(expected.reduce((sum, e) => sum + exposureFor(e.SKU_ID), 0)).toBe(24388);
  });
});

describe("rupees", () => {
  it("groups digits the Indian way", () => {
    expect(rupees(24388)).toBe("₹24,388");
    expect(rupees(120000)).toBe("₹1,20,000");
  });
});
