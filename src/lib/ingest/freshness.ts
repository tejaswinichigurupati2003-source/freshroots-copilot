import { z } from "zod";
import type { PipelineData } from "./types";

export const MAX_STOCK_AGE_DAYS = 7;

export class FreshnessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FreshnessError";
  }
}

const runDateSchema = z.string().date();

/** The date a run counts as "today". RUN_AS_OF lets the demo treat the 2026-10-19 seed data as fresh. */
export function resolveRunDate(env: Record<string, string | undefined> = process.env, now: Date = new Date()): string {
  const override = env.RUN_AS_OF?.trim();
  return runDateSchema.parse(override || now.toISOString().slice(0, 10));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** Throws FreshnessError with a plain-English message when the data cannot be trusted for this run. */
export function checkFreshness(runDate: string, data: Omit<PipelineData, "openPos">): void {
  const empty = (["skus", "sales", "stock", "calendar"] as const).filter((name) => data[name].length === 0);
  if (empty.length > 0) {
    throw new FreshnessError(`Required data is missing: ${empty.join(", ")} ${empty.length > 1 ? "are" : "is"} empty.`);
  }

  const latestBySku = new Map<string, string>();
  for (const row of data.stock) {
    const current = latestBySku.get(row.sku_id);
    if (!current || row.as_of_date > current) latestBySku.set(row.sku_id, row.as_of_date);
  }

  const noStock = data.skus.filter((s) => !latestBySku.has(s.sku_id)).map((s) => s.sku_id);
  if (noStock.length > 0) {
    throw new FreshnessError(`No stock snapshot for: ${noStock.join(", ")}.`);
  }

  const yearMonth = runDate.slice(0, 7);
  if (!data.calendar.some((c) => c.year_month === yearMonth)) {
    throw new FreshnessError(`calendar.csv has no row for ${yearMonth}, so the festival check cannot run.`);
  }

  const oldest = [...latestBySku.values()].sort()[0];
  const age = daysBetween(oldest, runDate);
  if (age > MAX_STOCK_AGE_DAYS) {
    throw new FreshnessError(
      `Stock data is ${age} days old (as of ${oldest}). Runs are blocked when it is more than ${MAX_STOCK_AGE_DAYS} days older than the run date (${runDate}).`,
    );
  }
}
