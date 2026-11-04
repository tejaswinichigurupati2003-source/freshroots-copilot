import { cache } from "react";
import { getDb } from "./db/client";
import { loadMonitor, type MonitorView } from "./db/monitor-store";
import { getThresholds } from "./monitor/types";

/**
 * Data the page frame needs on every route. Wrapped in cache() so a page that also asks for it in the same
 * request does not hit the database twice. A database problem returns null: the page reports it, the frame stays up.
 */
export const getMonitorView = cache(async (): Promise<MonitorView | null> => {
  try {
    return await loadMonitor(getDb(), getThresholds());
  } catch {
    return null;
  }
});

/** Where the stock is held, from the latest stock snapshot. */
export const getWarehouse = cache(async (): Promise<string | null> => {
  try {
    const rows = await getDb().query<{ location: string }>("select location from stock_snapshots order by as_of_date desc limit 1");
    return rows[0]?.location ?? null;
  } catch {
    return null;
  }
});
