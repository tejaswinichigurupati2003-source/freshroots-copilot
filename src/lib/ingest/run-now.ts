import { getDb } from "../db/client";
import { SupabaseOpenPoStore } from "../db/push-store";
import { SupabaseRunStore } from "../db/run-store";
import { createGateway } from "../zoho/factory";
import { syncOpenPos } from "../zoho/sync-open-pos";
import { explainAll } from "../llm/explain";
import { createGeminiClient } from "../llm/gemini-client";
import { CsvSeedSource } from "./csv-seed-source";
import { resolveRunDate } from "./freshness";
import { runPipeline, type PipelineResult } from "./pipeline";

/** Runs the pipeline against Supabase with the seed-backed data source. Shared by the API routes and the CLI. */
export function runNow(triggeredBy: string): Promise<PipelineResult> {
  const db = getDb();
  const store = new SupabaseRunStore(db);
  const client = createGeminiClient();
  return runPipeline(resolveRunDate(), triggeredBy, {
    source: new CsvSeedSource(db),
    store,
    explain: (items) => explainAll(items, { client, audit: (entry) => store.audit(entry) }),
    // Created here so a bad live Zoho setup becomes a failed run with a clear message. Mock mode does nothing.
    beforeLoad: () => syncOpenPos(createGateway(), new SupabaseOpenPoStore(db)),
  });
}

/** HTTP status for each outcome: 423 kill switch, 409 stale or missing data, 500 unexpected failure. */
export function httpStatusFor(result: PipelineResult): number {
  if (result.status === "completed") return 200;
  if (result.status === "failed") return 500;
  return result.reason === "kill_switch" ? 423 : 409;
}
