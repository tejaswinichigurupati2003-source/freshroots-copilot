import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSeedRows, seedTables } from "../ingest/seed-files";
import { evaluateSku } from "./engine";

const root = path.resolve(import.meta.dirname, "../../..");
const seedDir = path.join(root, "data/seed");
const AS_OF = "2026-10-19";

const table = (name: string) => loadSeedRows(seedTables.find((t) => t.table === name)!, seedDir);

const skus = table("skus") as { sku_id: string; standard_reorder_qty: number; perishability: "Low" | "Medium" | "High" }[];
const sales = table("sales_weekly") as { sku_id: string; week: string; units_sold: number }[];
const stock = table("stock_snapshots") as { sku_id: string; units_on_hand: number; as_of_date: string }[];
const pos = table("open_pos") as { sku_id: string; qty_units: number }[];
const calendar = table("calendar") as { year_month: string; is_festival_month: boolean }[];

const expected = parse(readFileSync(path.join(root, "data/expected/expected_results.csv"), "utf8"), {
  columns: true,
  skip_empty_lines: true,
}) as { SKU_ID: string; Expected_Flag: string; Expected_Order_Qty: string; Weeks_Of_Cover: string; Effective_Stock: string }[];

const isFestival = calendar.find((c) => c.year_month === AS_OF.slice(0, 7))!.is_festival_month;

function run(skuId: string) {
  const sku = skus.find((s) => s.sku_id === skuId)!;
  return evaluateSku({
    weeklySales: sales
      .filter((s) => s.sku_id === skuId)
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((s) => s.units_sold),
    unitsOnHand: stock.find((s) => s.sku_id === skuId && s.as_of_date === AS_OF)!.units_on_hand,
    openPoUnits: pos.filter((p) => p.sku_id === skuId).reduce((sum, p) => sum + p.qty_units, 0),
    standardQty: sku.standard_reorder_qty,
    perishability: sku.perishability,
    isFestivalMonth: isFestival,
  });
}

describe(`golden answer key (as of ${AS_OF})`, () => {
  it("covers all 18 SKUs", () => {
    expect(expected).toHaveLength(18);
  });

  it.each(expected.map((e) => [e.SKU_ID, e] as const))("%s matches flag and quantity", (skuId, e) => {
    const result = run(skuId);
    expect({ flag: result.flag, qty: result.orderQty }).toEqual({ flag: e.Expected_Flag, qty: Number(e.Expected_Order_Qty) });
    expect(result.effectiveStock).toBe(Number(e.Effective_Stock));
    if (e.Weeks_Of_Cover !== "") expect(result.weeksOfCover!).toBeCloseTo(Number(e.Weeks_Of_Cover), 1);
  });
});
