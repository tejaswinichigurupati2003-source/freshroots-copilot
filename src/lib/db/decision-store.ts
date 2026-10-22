import type { SupabaseClient } from "@supabase/supabase-js";
import { AlreadyDecidedError, type DecisionRecord, type DecisionStore, type RecommendationForDecision } from "../approval/decide";
import type { AuditEntry } from "../ingest/pipeline";

const UNIQUE_VIOLATION = "23505";

export class SupabaseDecisionStore implements DecisionStore {
  constructor(private readonly db: SupabaseClient) {}

  async getRecommendation(id: string): Promise<RecommendationForDecision | null> {
    const { data, error } = await this.db
      .from("recommendations")
      .select("id, sku_id, flag, recommended_qty, status, edge_case_type, signals")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Could not read recommendation: ${error.message}`);
    return data as RecommendationForDecision | null;
  }

  async saveDecision(decision: DecisionRecord, newStatus: "approved" | "rejected") {
    // decisions.recommendation_id is unique, so a double click cannot record two decisions.
    const insert = await this.db.from("decisions").insert(decision);
    if (insert.error) {
      if (insert.error.code === UNIQUE_VIOLATION) throw new AlreadyDecidedError();
      throw new Error(`Could not save decision: ${insert.error.message}`);
    }
    const update = await this.db.from("recommendations").update({ status: newStatus }).eq("id", decision.recommendation_id);
    if (update.error) throw new Error(`Could not update recommendation: ${update.error.message}`);
  }

  async audit(entry: AuditEntry) {
    const { error } = await this.db.from("audit_log").insert(entry);
    if (error) throw new Error(`Could not write audit log: ${error.message}`);
  }
}
