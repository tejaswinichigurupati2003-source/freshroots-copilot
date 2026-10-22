import type { SupabaseClient } from "@supabase/supabase-js";
import type { Explanation } from "../llm/contract";
import type { AuditEntry, RecommendationInsert, RunStore } from "../ingest/pipeline";

function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

export class SupabaseRunStore implements RunStore {
  constructor(private readonly db: SupabaseClient) {}

  async getKillSwitch() {
    const row = check(
      await this.db.from("system_state").select("is_active, reason").eq("key", "kill_switch").maybeSingle(),
      "Could not read kill switch",
    );
    return { active: row?.is_active ?? false, reason: row?.reason ?? null };
  }

  async createRun(asOfDate: string, triggeredBy: string) {
    const row = check(
      await this.db.from("runs").insert({ as_of_date: asOfDate, triggered_by: triggeredBy }).select("id").single(),
      "Could not create run",
    );
    return (row as { id: string }).id;
  }

  async finishRun(runId: string, status: "completed" | "blocked" | "failed", error?: string) {
    check(
      await this.db.from("runs").update({ status, error: error ?? null, finished_at: new Date().toISOString() }).eq("id", runId),
      "Could not update run",
    );
  }

  async saveRecommendations(runId: string, rows: RecommendationInsert[]) {
    check(
      await this.db.from("recommendations").insert(rows.map((r) => ({ ...r, run_id: runId }))),
      "Could not save recommendations",
    );
  }

  async saveExplanations(runId: string, explanations: Map<string, Explanation>) {
    for (const [skuId, e] of explanations) {
      check(
        await this.db
          .from("recommendations")
          .update({ reason: e.reason, edge_case_type: e.edge_case_type, evidence: e.evidence, explanation_source: e.explanation_source })
          .eq("run_id", runId)
          .eq("sku_id", skuId),
        `Could not save explanation for ${skuId}`,
      );
    }
  }

  async audit(entry: AuditEntry) {
    check(await this.db.from("audit_log").insert(entry), "Could not write audit log");
  }
}
