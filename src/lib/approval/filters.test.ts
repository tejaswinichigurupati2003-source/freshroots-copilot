import { describe, expect, it } from "vitest";
import { applyFilter, countByFilter, parseFilter } from "./filters";

const row = (sku_id: string, flag: string, opts: { signals?: Record<string, unknown>; decided?: boolean } = {}) => ({
  sku_id,
  flag,
  edge_case_type: null,
  signals: opts.signals ?? {},
  decision: opts.decided ? { action: "approved" } : null,
});

const rows = [
  row("SKU016", "INSUFFICIENT_HISTORY", { signals: { shortHistory: true } }),
  row("SKU017", "OK", { signals: { recentDrop: true } }),
  row("SKU001", "STOCKOUT_RISK", { decided: true }),
  row("SKU011", "STOCKOUT_RISK"),
  row("SKU006", "OVERSTOCK_RISK"),
  row("SKU003", "HIGH_DEMAND"),
];

describe("filters", () => {
  it("narrows the table by outcome and by whether Raghav has decided", () => {
    const ids = (f: Parameters<typeof applyFilter>[1]) => applyFilter(rows, f).map((r) => r.sku_id);
    expect(ids("stockout")).toEqual(["SKU001", "SKU011"]);
    expect(ids("overstock")).toEqual(["SKU006"]);
    expect(ids("high")).toEqual(["SKU003"]);
    expect(ids("edge")).toEqual(["SKU016", "SKU017"]);
    expect(ids("decided")).toEqual(["SKU001"]);
    expect(ids("waiting")).toHaveLength(5);
    expect(ids("all")).toHaveLength(6);
  });

  it("counts every filter for the chips", () => {
    expect(countByFilter(rows)).toEqual({ all: 6, waiting: 5, decided: 1, edge: 2, stockout: 2, overstock: 1, high: 1 });
  });

  it("falls back to all for an unknown value", () => {
    expect(parseFilter("nonsense")).toBe("all");
    expect(parseFilter(undefined)).toBe("all");
    expect(parseFilter("edge")).toBe("edge");
  });
});
