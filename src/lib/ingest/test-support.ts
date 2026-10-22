import path from "node:path";
import type { AuditEntry, RecommendationInsert, RunStore } from "./pipeline";
import { loadSeedRows, seedTables } from "./seed-files";
import type { DataSource, PipelineData } from "./types";

/** Helpers for tests and the rubric check: the seed CSVs as a data source, and a run store that lives in memory. */

// Tests and scripts both run from the repo root.
const seedDir = path.resolve(process.cwd(), "data/seed");

export const seedRows = <T>(name: string) => loadSeedRows(seedTables.find((t) => t.table === name)!, seedDir) as unknown as T[];

export const seedData = (): PipelineData => ({
  skus: seedRows("skus"),
  sales: seedRows("sales_weekly"),
  stock: seedRows("stock_snapshots"),
  calendar: seedRows("calendar"),
  openPos: seedRows("open_pos"),
});

export const sourceFrom = (data: PipelineData): DataSource => ({
  getSkus: async () => data.skus,
  getWeeklySales: async () => data.sales,
  getStock: async () => data.stock,
  getCalendar: async () => data.calendar,
  getOpenPos: async () => data.openPos,
});

export function memoryStore(killSwitch = { active: false, reason: null as string | null }) {
  const runs: { id: string; status?: string; error?: string }[] = [];
  const saved: RecommendationInsert[] = [];
  const audit: AuditEntry[] = [];
  const store: RunStore = {
    getKillSwitch: async () => killSwitch,
    createRun: async () => {
      runs.push({ id: `run-${runs.length + 1}` });
      return runs[runs.length - 1].id;
    },
    finishRun: async (id, status, error) => {
      Object.assign(runs.find((r) => r.id === id)!, { status, error });
    },
    saveRecommendations: async (_id, rows) => {
      saved.push(...rows);
    },
    saveExplanations: async () => {},
    audit: async (entry) => {
      audit.push(entry);
    },
  };
  return { store, runs, saved, audit };
}
