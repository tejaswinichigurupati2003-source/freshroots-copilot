import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditEntry } from "../ingest/pipeline";
import type { OpenPoLine } from "../zoho/types";
import type { OpenPoStore } from "../zoho/sync-open-pos";
import type { ApprovedLine, DraftRecord, PushStore } from "../zoho/push";

function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

export class SupabasePushStore implements PushStore {
  constructor(private readonly db: SupabaseClient) {}

  async getKillSwitch() {
    const row = must(await this.db.from("system_state").select("is_active, reason").eq("key", "kill_switch").maybeSingle(), "Could not read kill switch");
    return { active: row?.is_active ?? false, reason: row?.reason ?? null };
  }

  async listApprovedLines(): Promise<ApprovedLine[]> {
    const run = must(
      await this.db.from("runs").select("id").eq("status", "completed").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      "Could not read runs",
    );
    if (!run) return [];

    type Row = {
      id: string;
      run_id: string;
      sku_id: string;
      skus: { sku_name: string; distributor_id: string } | { sku_name: string; distributor_id: string }[];
      decisions: { final_qty: number; action: string } | { final_qty: number; action: string }[] | null;
    };
    const rows = must(
      await this.db
        .from("recommendations")
        .select("id, run_id, sku_id, skus(sku_name, distributor_id), decisions(final_qty, action)")
        .eq("run_id", run.id)
        .eq("status", "approved"),
      "Could not read approved lines",
    ) as unknown as Row[];

    const first = <T>(v: T | T[] | null) => (Array.isArray(v) ? (v[0] ?? null) : v);
    return rows.flatMap((r) => {
      const sku = first(r.skus);
      const decision = first(r.decisions);
      if (!sku || !decision) return [];
      return [{ recommendation_id: r.id, run_id: r.run_id, sku_id: r.sku_id, sku_name: sku.sku_name, distributor_id: sku.distributor_id, final_qty: decision.final_qty }];
    });
  }

  async listPushedSkus(runId: string) {
    const drafts = must(await this.db.from("zoho_drafts").select("lines").eq("run_id", runId), "Could not read drafts") as { lines: { sku_id: string }[] }[];
    return new Set(drafts.flatMap((d) => d.lines.map((l) => l.sku_id)));
  }

  async claimLines(recommendationIds: string[]) {
    const rows = must(
      await this.db.from("recommendations").update({ status: "pushed" }).in("id", recommendationIds).eq("status", "approved").select("id"),
      "Could not claim lines",
    ) as { id: string }[];
    return rows.map((r) => r.id);
  }

  async releaseLines(recommendationIds: string[]) {
    must(await this.db.from("recommendations").update({ status: "approved" }).in("id", recommendationIds).eq("status", "pushed"), "Could not release lines");
  }

  async saveDraft(draft: DraftRecord) {
    must(await this.db.from("zoho_drafts").insert(draft), "Could not save draft");
  }

  async audit(entry: AuditEntry) {
    must(await this.db.from("audit_log").insert(entry), "Could not write audit log");
  }
}

export class SupabaseOpenPoStore implements OpenPoStore {
  constructor(private readonly db: SupabaseClient) {}

  async replaceOpenPos(lines: OpenPoLine[]) {
    if (lines.length > 0) must(await this.db.from("open_pos").upsert(lines, { onConflict: "po_id" }), "Could not save open POs");
    const existing = must(await this.db.from("open_pos").select("po_id"), "Could not read open POs") as { po_id: string }[];
    const keep = new Set(lines.map((l) => l.po_id));
    const stale = existing.map((e) => e.po_id).filter((id) => !keep.has(id));
    if (stale.length > 0) must(await this.db.from("open_pos").delete().in("po_id", stale), "Could not remove closed POs");
  }
}
