import { RULES_CONFIG } from "../rules/engine";
import type { RecommendationInsert } from "../ingest/pipeline";

export const EDGE_CASE_TYPES = ["NONE", "NEW_LAUNCH", "DISTRIBUTOR_DROP", "ONE_OFF_SPIKE", "OTHER"] as const;
export type EdgeCaseType = (typeof EDGE_CASE_TYPES)[number];

/** Compact, code-computed facts passed to the LLM. Every number the LLM may quote must appear here. */
export interface SkuFacts {
  sku_id: string;
  sku_name: string;
  flag: string;
  recommended_qty: number;
  standard_reorder_qty: number;
  order_multiple_of_standard: number;
  weeks_of_cover: number | null;
  cover_min_weeks: number;
  cover_max_weeks: number;
  spike_ratio: number | null;
  spike_percent_over_average: number | null;
  last_4_weekly_sales: number[];
  avg_12_week: number | null;
  median_12_week: number | null;
  effective_stock: number;
  open_po_units: number;
  festival_month: boolean;
  history_weeks: number;
  spike_week: string | null;
  spike_week_units: number | null;
  recent_drop_percent: number | null;
  signals: string[];
}

interface RecentWeek {
  week: string;
  units: number;
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function hasEdgeSignals(rec: Pick<RecommendationInsert, "signals">): boolean {
  const s = rec.signals;
  return Boolean(s.shortHistory || s.recentDrop || s.oneWeekSpike);
}

/** Which recommendations go to the LLM: every non-OK flag, and any SKU with an edge-case signal. */
export function needsLlm(rec: Pick<RecommendationInsert, "flag" | "signals">): boolean {
  return rec.flag !== "OK" || hasEdgeSignals(rec);
}

export function buildFacts(rec: RecommendationInsert, sku: { sku_name: string; standard_reorder_qty: number; perishability: string }): SkuFacts {
  const s = rec.signals as {
    shortHistory: boolean;
    recentDrop: boolean;
    oneWeekSpike: boolean;
    oneWeekSpikeWeek: string | null;
    avg12: number | null;
    avg4: number | null;
    openPoUnits: number;
    isFestivalMonth: boolean;
    recentWeeks: RecentWeek[];
  };
  const limits = sku.perishability === "High" ? RULES_CONFIG.highPerishableCover : RULES_CONFIG.generalCover;
  const units = s.recentWeeks.map((w) => w.units);
  const last12 = units.slice(-RULES_CONFIG.historyWeeksRequired);
  const spikeUnits = s.oneWeekSpikeWeek ? (s.recentWeeks.find((w) => w.week === s.oneWeekSpikeWeek)?.units ?? null) : null;
  const dropPercent = s.recentDrop && s.avg12 && s.avg4 !== null ? Math.round((1 - s.avg4 / s.avg12) * 100) : null;
  const spikePercent = rec.spike_ratio !== null && rec.spike_ratio > 1 ? Math.round((rec.spike_ratio - 1) * 100) : null;

  const signals: string[] = [];
  if (s.shortHistory) signals.push(`only ${units.length} weeks of sales history`);
  if (s.oneWeekSpike) signals.push(`one week above ${RULES_CONFIG.edge.oneWeekSpikeVsMedian} x the 12-week median`);
  if (s.recentDrop && dropPercent !== null) signals.push(`last 4 weeks ${dropPercent} percent below the 12-week average`);

  return {
    sku_id: rec.sku_id,
    sku_name: sku.sku_name,
    flag: rec.flag,
    recommended_qty: rec.recommended_qty,
    standard_reorder_qty: sku.standard_reorder_qty,
    order_multiple_of_standard: round(rec.recommended_qty / sku.standard_reorder_qty, 1),
    weeks_of_cover: rec.weeks_of_cover === null ? null : round(rec.weeks_of_cover, 1),
    cover_min_weeks: limits.min,
    cover_max_weeks: limits.max,
    spike_ratio: rec.spike_ratio === null ? null : round(rec.spike_ratio, 2),
    spike_percent_over_average: spikePercent,
    last_4_weekly_sales: units.slice(-RULES_CONFIG.recentWeeks),
    avg_12_week: s.avg12 === null ? null : round(s.avg12, 1),
    median_12_week: last12.length === RULES_CONFIG.historyWeeksRequired ? round(median(last12), 1) : null,
    effective_stock: rec.effective_stock,
    open_po_units: s.openPoUnits,
    festival_month: s.isFestivalMonth,
    history_weeks: units.length,
    spike_week: s.oneWeekSpikeWeek,
    spike_week_units: spikeUnits,
    recent_drop_percent: dropPercent,
    signals,
  };
}
