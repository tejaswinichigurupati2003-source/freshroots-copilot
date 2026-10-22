import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const num = z.coerce.number();
const int = z.coerce.number().int();
const bool = z.enum(["TRUE", "FALSE"]).transform((v) => v === "TRUE");

/** One entry per seed CSV: file, target table, conflict key for upserts, and a row schema that maps CSV columns to table columns. */
export const seedTables = [
  {
    table: "distributors",
    file: "distributors.csv",
    conflict: "distributor_id",
    schema: z
      .object({ Distributor_ID: z.string(), Distributor_Name: z.string(), Region: z.string(), Status: z.string() })
      .transform((r) => ({ distributor_id: r.Distributor_ID, distributor_name: r.Distributor_Name, region: r.Region, status: r.Status })),
  },
  {
    table: "skus",
    file: "sku_merged.csv",
    conflict: "sku_id",
    schema: z
      .object({
        SKU_ID: z.string(),
        SKU_Name: z.string(),
        Category: z.string(),
        Perishability: z.enum(["Low", "Medium", "High"]),
        Standard_Reorder_Qty: int.positive(),
        Unit_of_Measure: z.string(),
        Distributor_ID: z.string(),
      })
      .transform((r) => ({
        sku_id: r.SKU_ID,
        sku_name: r.SKU_Name,
        category: r.Category,
        perishability: r.Perishability,
        standard_reorder_qty: r.Standard_Reorder_Qty,
        unit_of_measure: r.Unit_of_Measure,
        distributor_id: r.Distributor_ID,
      })),
  },
  {
    table: "calendar",
    file: "calendar.csv",
    conflict: "year_month",
    schema: z
      .object({ Year: int, Month: int.min(1).max(12), Year_Month: z.string(), Is_Festival_Month: bool })
      .transform((r) => ({ year: r.Year, month: r.Month, year_month: r.Year_Month, is_festival_month: r.Is_Festival_Month })),
  },
  {
    table: "sales_weekly",
    file: "weekly_sales_merged.csv",
    conflict: "sku_id,week",
    schema: z
      .object({ SKU_ID: z.string(), Week: z.string().regex(/^\d{4}-W\d{2}$/), Units_Sold: int.nonnegative() })
      .transform((r) => ({ sku_id: r.SKU_ID, week: r.Week, units_sold: r.Units_Sold })),
  },
  {
    table: "stock_snapshots",
    file: "inventory_merged.csv",
    conflict: "sku_id,location,as_of_date",
    schema: z
      .object({ SKU_ID: z.string(), Location: z.string(), Units_On_Hand: int.nonnegative(), As_Of_Date: z.string().date() })
      .transform((r) => ({ sku_id: r.SKU_ID, location: r.Location, units_on_hand: r.Units_On_Hand, as_of_date: r.As_Of_Date })),
  },
  {
    table: "open_pos",
    file: "open_pos_seed.csv",
    conflict: "po_id",
    schema: z
      .object({
        PO_ID: z.string(),
        SKU_ID: z.string(),
        Qty_Units: int.positive(),
        Order_Date: z.string().date(),
        Expected_Arrival: z.string().date(),
        Status: z.string(),
      })
      .transform((r) => ({
        po_id: r.PO_ID,
        sku_id: r.SKU_ID,
        qty_units: r.Qty_Units,
        order_date: r.Order_Date,
        expected_arrival: r.Expected_Arrival,
        status: r.Status,
      })),
  },
  {
    table: "sku_economics",
    file: "sku_economics_seed.csv",
    conflict: "sku_id",
    schema: z
      .object({
        SKU_ID: z.string(),
        Unit_Cost_INR: num,
        Selling_Price_INR: num,
        Stockout_Loss_Per_Unit_INR: num,
        Overstock_Loss_Per_Unit_INR: num,
      })
      .transform((r) => ({
        sku_id: r.SKU_ID,
        unit_cost_inr: r.Unit_Cost_INR,
        selling_price_inr: r.Selling_Price_INR,
        stockout_loss_per_unit_inr: r.Stockout_Loss_Per_Unit_INR,
        overstock_loss_per_unit_inr: r.Overstock_Loss_Per_Unit_INR,
      })),
  },
  {
    table: "past_recommendations",
    file: "raghav_past_recommendations_seed.csv",
    conflict: "month,sku_id",
    schema: z
      .object({
        Month: z.string(),
        SKU_ID: z.string(),
        Raghav_Flag: z.string(),
        Order_Qty_Multiple_Of_Standard: z.string(),
        Raghav_Action: z.string(),
        Basis: z.string(),
        Notes: z.string(),
      })
      .transform((r) => ({
        month: r.Month,
        sku_id: r.SKU_ID,
        raghav_flag: r.Raghav_Flag,
        order_qty_multiple: r.Order_Qty_Multiple_Of_Standard,
        raghav_action: r.Raghav_Action,
        basis: r.Basis,
        notes: r.Notes || null,
      })),
  },
  {
    table: "loss_tracking",
    file: "baseline_losses_seed.csv",
    conflict: "period",
    schema: z
      .object({ period: z.string(), stockout_loss_lakh: num.nonnegative(), overstock_loss_lakh: num.nonnegative() })
      .transform((r) => ({
        period: r.period,
        stockout_loss_lakh: r.stockout_loss_lakh,
        overstock_loss_lakh: r.overstock_loss_lakh,
        source: "baseline_seed",
      })),
  },
] as const;

/** Reads one seed CSV and validates every row. Throws a ZodError naming the bad row. */
export function loadSeedRows(entry: (typeof seedTables)[number], seedDir: string): Record<string, unknown>[] {
  const records: unknown[] = parse(readFileSync(path.join(seedDir, entry.file), "utf8"), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
  return records.map((record, i) => {
    const result = (entry.schema as z.ZodType<Record<string, unknown>>).safeParse(record);
    if (!result.success) {
      throw new Error(`${entry.file} row ${i + 2}: ${result.error.message}`);
    }
    return result.data;
  });
}
