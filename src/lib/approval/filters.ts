import { isEdgeCase, type ReviewFields } from "./review";

export const FILTERS = [
  { id: "all", label: "All" },
  { id: "waiting", label: "Waiting" },
  { id: "decided", label: "Decided" },
  { id: "edge", label: "Edge cases" },
  { id: "stockout", label: "Stockout" },
  { id: "overstock", label: "Overstock" },
  { id: "high", label: "High demand" },
] as const;

export type FilterId = (typeof FILTERS)[number]["id"];

type Filterable = ReviewFields & { decision: unknown | null };

const TESTS: Record<FilterId, (r: Filterable) => boolean> = {
  all: () => true,
  waiting: (r) => !r.decision,
  decided: (r) => Boolean(r.decision),
  edge: (r) => isEdgeCase(r),
  stockout: (r) => r.flag === "STOCKOUT_RISK",
  overstock: (r) => r.flag === "OVERSTOCK_RISK",
  high: (r) => r.flag === "HIGH_DEMAND",
};

/** Anything unknown (a mistyped link) shows everything instead of an empty table. */
export function parseFilter(value: string | undefined): FilterId {
  return FILTERS.find((f) => f.id === value)?.id ?? "all";
}

export function applyFilter<T extends Filterable>(rows: T[], filter: FilterId): T[] {
  return rows.filter(TESTS[filter]);
}

export function countByFilter<T extends Filterable>(rows: T[]): Record<FilterId, number> {
  return Object.fromEntries(FILTERS.map((f) => [f.id, rows.filter(TESTS[f.id]).length])) as Record<FilterId, number>;
}
