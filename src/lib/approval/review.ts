export const FLAG_ORDER = ["STOCKOUT_RISK", "OVERSTOCK_RISK", "HIGH_DEMAND", "INSUFFICIENT_HISTORY", "OK"] as const;

export interface ReviewFields {
  sku_id: string;
  flag: string;
  edge_case_type: string | null;
  signals: Record<string, unknown>;
}

/** An edge case is anything the code's signals or the LLM's classification point at. */
export function isEdgeCase(row: Pick<ReviewFields, "edge_case_type" | "signals">): boolean {
  const s = row.signals;
  return Boolean(s.shortHistory || s.recentDrop || s.oneWeekSpike || (row.edge_case_type && row.edge_case_type !== "NONE"));
}

/** Rows with flag OK and no edge case need no approval. */
export function needsReview(row: Pick<ReviewFields, "flag" | "edge_case_type" | "signals">): boolean {
  return row.flag !== "OK" || isEdgeCase(row);
}

/** Edge cases first, then STOCKOUT_RISK, OVERSTOCK_RISK, HIGH_DEMAND, OK. SKU id breaks ties. */
export function sortForReview<T extends ReviewFields>(rows: T[]): T[] {
  const rank = (r: T) => (isEdgeCase(r) ? 0 : 1 + FLAG_ORDER.indexOf(r.flag as (typeof FLAG_ORDER)[number]));
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.sku_id.localeCompare(b.sku_id));
}
