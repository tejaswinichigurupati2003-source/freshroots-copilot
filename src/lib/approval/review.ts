import { rulesFromSignals } from "../rules/settings";
import { daysOfStockLeft } from "./stockout-timing";

export const FLAG_ORDER = ["STOCKOUT_RISK", "OVERSTOCK_RISK", "HIGH_DEMAND", "INSUFFICIENT_HISTORY", "OK"] as const;

export interface ReviewFields {
  sku_id: string;
  flag: string;
  effective_stock?: number;
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

function daysLeft(r: ReviewFields): number {
  if (r.flag !== "STOCKOUT_RISK" || r.effective_stock === undefined) return Infinity;
  return (
    daysOfStockLeft({
      effectiveStock: r.effective_stock,
      avg12: (r.signals.avg12 as number | null | undefined) ?? null,
      festival: Boolean(r.signals.isFestivalMonth),
      rules: rulesFromSignals(r.signals),
    }) ?? Infinity
  );
}

/**
 * Edge cases first, then STOCKOUT_RISK, OVERSTOCK_RISK, HIGH_DEMAND, OK. Within a group, stockouts that run out
 * soonest come first. SKU id breaks remaining ties.
 */
export function sortForReview<T extends ReviewFields>(rows: T[]): T[] {
  const rank = (r: T) => (isEdgeCase(r) ? 0 : 1 + FLAG_ORDER.indexOf(r.flag as (typeof FLAG_ORDER)[number]));
  return [...rows].sort((a, b) => {
    const da = daysLeft(a);
    const db = daysLeft(b);
    return rank(a) - rank(b) || (da === db ? 0 : da < db ? -1 : 1) || a.sku_id.localeCompare(b.sku_id);
  });
}
