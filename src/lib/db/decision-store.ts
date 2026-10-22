import { AlreadyDecidedError, type DecisionRecord, type DecisionStore, type RecommendationForDecision } from "../approval/decide";
import type { AuditEntry } from "../ingest/pipeline";
import type { Db } from "./client";
import { errorCode, insertRows, UNIQUE_VIOLATION } from "./sql";

export class DbDecisionStore implements DecisionStore {
  constructor(private readonly db: Db) {}

  async getRecommendation(id: string): Promise<RecommendationForDecision | null> {
    const [row] = await this.db.query<RecommendationForDecision>(
      "select id, sku_id, flag, recommended_qty, status, edge_case_type, signals from recommendations where id = $1",
      [id],
    );
    return row ?? null;
  }

  async saveDecision(decision: DecisionRecord, newStatus: "approved" | "rejected") {
    // One statement, so the decision and the status change land together. decisions.recommendation_id is
    // unique, so a double click cannot record two decisions.
    try {
      await this.db.query(
        `with saved as (
           insert into decisions (recommendation_id, sku_id, decided_by, action, original_qty, final_qty, reason)
           values ($1, $2, $3, $4, $5, $6, $7)
           returning recommendation_id
         )
         update recommendations set status = $8 where id in (select recommendation_id from saved)`,
        [decision.recommendation_id, decision.sku_id, decision.decided_by, decision.action, decision.original_qty, decision.final_qty, decision.reason, newStatus],
      );
    } catch (err) {
      if (errorCode(err) === UNIQUE_VIOLATION) throw new AlreadyDecidedError();
      throw err;
    }
  }

  async audit(entry: AuditEntry) {
    await insertRows(this.db, "audit_log", [{ actor: entry.actor, action: entry.action, entity: entry.entity ?? null, entity_id: entry.entity_id ?? null, details: entry.details ?? {} }]);
  }
}
