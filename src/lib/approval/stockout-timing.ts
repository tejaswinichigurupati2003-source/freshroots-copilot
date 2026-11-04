import { DEFAULT_RULE_SETTINGS, type RuleSettings } from "../rules/engine";

export interface TimingInput {
  effectiveStock: number;
  /** 12-week average weekly sales, before any festival uplift. */
  avg12: number | null;
  festival: boolean;
  rules?: RuleSettings;
}

/** Same demand figure the cover check uses (assumption A1), so days and weeks of cover always agree. */
export function daysOfStockLeft(i: TimingInput): number | null {
  if (i.avg12 === null || i.avg12 <= 0) return null;
  const weekly = i.festival ? i.avg12 * (i.rules ?? DEFAULT_RULE_SETTINGS).festivalUplift : i.avg12;
  return (i.effectiveStock / weekly) * 7;
}

export function daysText(days: number): string {
  if (days < 1) return "under a day";
  const n = Math.round(days);
  return n === 1 ? "1 day" : `${n} days`;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.floor(days));
  return d.toISOString().slice(0, 10);
}

/**
 * The date stock runs out, counted from the stock count date, and the earliest open PO arrival if that arrives after it.
 * Information only: it never changes a flag or quantity. Open PO units already count as stock (assumption A2),
 * so a late arrival means the cover figure is optimistic.
 */
export function runOutCheck(opts: { stockAsOf: string; daysLeft: number; arrivals: (string | null)[] }): { runsOutOn: string; lateArrival: string | null } {
  const runsOutOn = addDays(opts.stockAsOf, opts.daysLeft);
  const dated = opts.arrivals.filter((a): a is string => Boolean(a)).sort();
  const earliest = dated[0] ?? null;
  return { runsOutOn, lateArrival: earliest && earliest > runsOutOn ? earliest : null };
}
