import type { Db } from "../db/client";
import type { CalendarRow, DataSource, OpenPoRow, SalesRow, SkuRow, StockRow } from "./types";

/**
 * Stands in for the SAP export. The seed CSVs are loaded into Postgres by `npm run seed`;
 * this source reads them back from there. Open POs come from the open_pos table, which holds
 * the seed file in mock mode and a copy of Zoho's open POs in live mode.
 */
export class CsvSeedSource implements DataSource {
  constructor(private readonly db: Db) {}

  getSkus() {
    return this.db.query<SkuRow>("select sku_id, sku_name, perishability, standard_reorder_qty, distributor_id from skus");
  }

  getWeeklySales() {
    return this.db.query<SalesRow>("select sku_id, week, units_sold from sales_weekly");
  }

  getStock() {
    return this.db.query<StockRow>("select sku_id, units_on_hand, as_of_date from stock_snapshots");
  }

  getCalendar() {
    return this.db.query<CalendarRow>("select year_month, is_festival_month from calendar");
  }

  getOpenPos() {
    return this.db.query<OpenPoRow>("select po_id, sku_id, qty_units from open_pos");
  }
}
