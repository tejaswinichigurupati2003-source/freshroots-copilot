export interface SkuRow {
  sku_id: string;
  sku_name: string;
  perishability: "Low" | "Medium" | "High";
  standard_reorder_qty: number;
  distributor_id: string;
}

export interface SalesRow {
  sku_id: string;
  week: string;
  units_sold: number;
}

export interface StockRow {
  sku_id: string;
  units_on_hand: number;
  as_of_date: string;
}

export interface CalendarRow {
  year_month: string;
  is_festival_month: boolean;
}

export interface OpenPoRow {
  po_id: string;
  sku_id: string;
  qty_units: number;
}

/** Everything the pipeline needs from upstream systems. SAP is simulated by the seed data behind this interface. */
export interface DataSource {
  getSkus(): Promise<SkuRow[]>;
  getWeeklySales(): Promise<SalesRow[]>;
  getStock(): Promise<StockRow[]>;
  getCalendar(): Promise<CalendarRow[]>;
  getOpenPos(): Promise<OpenPoRow[]>;
}

export interface PipelineData {
  skus: SkuRow[];
  sales: SalesRow[];
  stock: StockRow[];
  calendar: CalendarRow[];
  openPos: OpenPoRow[];
}

export async function loadPipelineData(source: DataSource): Promise<PipelineData> {
  const [skus, sales, stock, calendar, openPos] = await Promise.all([
    source.getSkus(),
    source.getWeeklySales(),
    source.getStock(),
    source.getCalendar(),
    source.getOpenPos(),
  ]);
  return { skus, sales, stock, calendar, openPos };
}
