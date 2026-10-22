import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarRow, DataSource, OpenPoRow, SalesRow, SkuRow, StockRow } from "./types";

const PAGE_SIZE = 1000;

async function fetchAll<T>(db: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not read ${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) return rows;
  }
}

/**
 * Stands in for the SAP export. The seed CSVs are loaded into Supabase by `npm run seed`;
 * this source reads them back from there. Open POs come from the open_pos table, which holds
 * the seed file in mock mode and a copy of Zoho's open POs in live mode.
 */
export class CsvSeedSource implements DataSource {
  constructor(private readonly db: SupabaseClient) {}

  getSkus() {
    return fetchAll<SkuRow>(this.db, "skus", "sku_id, sku_name, perishability, standard_reorder_qty, distributor_id");
  }

  getWeeklySales() {
    return fetchAll<SalesRow>(this.db, "sales_weekly", "sku_id, week, units_sold");
  }

  getStock() {
    return fetchAll<StockRow>(this.db, "stock_snapshots", "sku_id, units_on_hand, as_of_date");
  }

  getCalendar() {
    return fetchAll<CalendarRow>(this.db, "calendar", "year_month, is_festival_month");
  }

  getOpenPos() {
    return fetchAll<OpenPoRow>(this.db, "open_pos", "po_id, sku_id, qty_units");
  }
}
