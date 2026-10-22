import type { AuditEntry } from "../ingest/pipeline";
import type { OpenPoLine } from "../zoho/types";
import type { OpenPoStore } from "../zoho/sync-open-pos";
import type { ApprovedLine, DraftRecord, PushStore } from "../zoho/push";
import type { Db } from "./client";
import { insertRows } from "./sql";

export class DbPushStore implements PushStore {
  constructor(private readonly db: Db) {}

  async getKillSwitch() {
    const [row] = await this.db.query<{ is_active: boolean; reason: string | null }>("select is_active, reason from system_state where key = 'kill_switch'");
    return { active: row?.is_active ?? false, reason: row?.reason ?? null };
  }

  /** Approved, not yet pushed lines of the latest completed run. */
  listApprovedLines(): Promise<ApprovedLine[]> {
    return this.db.query<ApprovedLine>(
      `select r.id as recommendation_id, r.run_id, r.sku_id, s.sku_name, s.distributor_id, d.final_qty
         from recommendations r
         join skus s on s.sku_id = r.sku_id
         join decisions d on d.recommendation_id = r.id
        where r.status = 'approved'
          and r.run_id = (select id from runs where status = 'completed' order by started_at desc limit 1)`,
    );
  }

  async listPushedSkus(runId: string) {
    const drafts = await this.db.query<{ lines: { sku_id: string }[] }>("select lines from zoho_drafts where run_id = $1", [runId]);
    return new Set(drafts.flatMap((d) => d.lines.map((l) => l.sku_id)));
  }

  async claimLines(recommendationIds: string[]) {
    const rows = await this.db.query<{ id: string }>(
      "update recommendations set status = 'pushed' where id = any($1::uuid[]) and status = 'approved' returning id",
      [recommendationIds],
    );
    return rows.map((r) => r.id);
  }

  async releaseLines(recommendationIds: string[]) {
    await this.db.query("update recommendations set status = 'approved' where id = any($1::uuid[]) and status = 'pushed'", [recommendationIds]);
  }

  async saveDraft(draft: DraftRecord) {
    await insertRows(this.db, "zoho_drafts", [{ ...draft }]);
  }

  async audit(entry: AuditEntry) {
    await insertRows(this.db, "audit_log", [{ actor: entry.actor, action: entry.action, entity: entry.entity ?? null, entity_id: entry.entity_id ?? null, details: entry.details ?? {} }]);
  }
}

export class DbOpenPoStore implements OpenPoStore {
  constructor(private readonly db: Db) {}

  async replaceOpenPos(lines: OpenPoLine[]) {
    await insertRows(this.db, "open_pos", lines as unknown as Record<string, unknown>[], "po_id");
    await this.db.query("delete from open_pos where po_id <> all($1::text[])", [lines.map((l) => l.po_id)]);
  }
}
