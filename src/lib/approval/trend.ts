export interface WeekTotal {
  /** Week label as stored, for example 2026-W41. */
  week: string;
  units: number;
}

export interface SalesTrend {
  series: WeekTotal[];
  /** Average of the last 4 weeks and of all weeks shown. */
  last4Avg: number;
  avg: number;
  /** Last 4 weeks against the average of all weeks, in percent. */
  changePct: number;
}

/** Total units sold per week across every SKU, from the 12 recent weeks each row carries. */
export function salesTrend(rows: { signals: Record<string, unknown> }[]): SalesTrend | null {
  const totals = new Map<string, number>();
  for (const row of rows) {
    for (const w of (row.signals.recentWeeks ?? []) as { week: string; units: number }[]) {
      totals.set(w.week, (totals.get(w.week) ?? 0) + w.units);
    }
  }
  const series = [...totals].map(([week, units]) => ({ week, units })).sort((a, b) => a.week.localeCompare(b.week));
  if (series.length < 5) return null;

  const mean = (xs: WeekTotal[]) => xs.reduce((sum, x) => sum + x.units, 0) / xs.length;
  const avg = mean(series);
  const last4Avg = mean(series.slice(-4));
  return { series, last4Avg, avg, changePct: avg === 0 ? 0 : ((last4Avg - avg) / avg) * 100 };
}
