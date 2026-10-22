import type { Explanation } from "../llm/contract";
import type { AuditEntry, RecommendationInsert, RunStore } from "../ingest/pipeline";
import type { Db } from "./client";
import { insertRows } from "./sql";

export class DbRunStore implements RunStore {
  constructor(private readonly db: Db) {}

  async getKillSwitch() {
    const [row] = await this.db.query<{ is_active: boolean; reason: string | null }>("select is_active, reason from system_state where key = 'kill_switch'");
    return { active: row?.is_active ?? false, reason: row?.reason ?? null };
  }

  async createRun(asOfDate: string, triggeredBy: string) {
    const [row] = await this.db.query<{ id: string }>("insert into runs (as_of_date, triggered_by) values ($1, $2) returning id", [asOfDate, triggeredBy]);
    return row.id;
  }

  async finishRun(runId: string, status: "completed" | "blocked" | "failed", error?: string) {
    await this.db.query("update runs set status = $2, error = $3, finished_at = now() where id = $1", [runId, status, error ?? null]);
  }

  async saveRecommendations(runId: string, rows: RecommendationInsert[]) {
    await insertRows(this.db, "recommendations", rows.map((r) => ({ ...r, run_id: runId })));
  }

  async saveExplanations(runId: string, explanations: Map<string, Explanation>) {
    for (const [skuId, e] of explanations) {
      await this.db.query(
        "update recommendations set reason = $3, edge_case_type = $4, evidence = $5, explanation_source = $6 where run_id = $1 and sku_id = $2",
        [runId, skuId, e.reason, e.edge_case_type, e.evidence, e.explanation_source],
      );
    }
  }

  /**
   * Records which model wrote the explanations and what the calls cost. The audit entry always works;
   * the columns come from migration 0003 and are only written once it has been applied.
   */
  async saveLlmUsage(runId: string, usage: { model: string; calls: number; promptTokens: number; completionTokens: number; costUsd: number | null }) {
    await this.audit({ actor: "system", action: "llm_usage", entity: "run", entity_id: runId, details: usage });
    await this.db.query(
      "update runs set llm_model = $2, llm_calls = $3, llm_prompt_tokens = $4, llm_completion_tokens = $5, llm_cost_usd = $6 where id = $1",
      [runId, usage.model, usage.calls, usage.promptTokens, usage.completionTokens, usage.costUsd],
    );
    await this.db.query("update recommendations set explanation_model = $2 where run_id = $1 and explanation_source = 'llm'", [runId, usage.model]);
  }

  async audit(entry: AuditEntry) {
    await insertRows(this.db, "audit_log", [{ actor: entry.actor, action: entry.action, entity: entry.entity ?? null, entity_id: entry.entity_id ?? null, details: entry.details ?? {} }]);
  }
}
