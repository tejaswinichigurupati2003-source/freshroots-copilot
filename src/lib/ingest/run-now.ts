import { getDb } from "../db/client";
import { DbOpenPoStore } from "../db/push-store";
import { loadRules } from "../db/rules-store";
import { DbRunStore } from "../db/run-store";
import { createGateway } from "../zoho/factory";
import { syncOpenPos } from "../zoho/sync-open-pos";
import { explainAll } from "../llm/explain";
import { createOpenRouterClient, createUsageMeter } from "../llm/openrouter-client";
import { CsvSeedSource } from "./csv-seed-source";
import { resolveRunDate } from "./freshness";
import { runPipeline, type PipelineResult } from "./pipeline";

/** Runs the pipeline against Postgres with the seed-backed data source. Shared by the API routes and the CLI. */
export async function runNow(triggeredBy: string): Promise<PipelineResult> {
  const db = getDb();
  const store = new DbRunStore(db);
  const meter = createUsageMeter();
  const client = createOpenRouterClient(process.env, { onUsage: meter.record });

  const result = await runPipeline(resolveRunDate(), triggeredBy, {
    source: new CsvSeedSource(db),
    store,
    explain: (items) => explainAll(items, { client, audit: (entry) => store.audit(entry) }),
    // Created here so a bad live Zoho setup becomes a failed run with a clear message. Mock mode does nothing.
    beforeLoad: () => syncOpenPos(createGateway(), new DbOpenPoStore(db)),
    // The rules saved on the page. A run keeps a copy of what it used, so later edits never rewrite it.
    loadRules: async () => (await loadRules(db)).settings,
  });

  // Which model ran and what it cost. Best effort: a missing column or a failed write never changes the run.
  const usage = meter.summary();
  if (result.status === "completed" && usage) {
    try {
      await store.saveLlmUsage(result.runId, usage);
    } catch (err) {
      await store.audit({ actor: "system", action: "llm_usage_not_saved", entity: "run", entity_id: result.runId, details: { message: err instanceof Error ? err.message : String(err) } }).catch(() => {});
    }
  }
  return result;
}

/** HTTP status for each outcome: 423 kill switch, 409 stale or missing data, 500 unexpected failure. */
export function httpStatusFor(result: PipelineResult): number {
  if (result.status === "completed") return 200;
  if (result.status === "failed") return 500;
  return result.reason === "kill_switch" ? 423 : 409;
}
