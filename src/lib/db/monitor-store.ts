import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditEntry } from "../ingest/pipeline";
import { lossLevel, type LossLevel } from "../monitor/loss";
import { currentRejectionStatus, type RejectionStatus } from "../monitor/rejection";
import type { KillSwitchState, LossEntry, MonitorStore, Thresholds } from "../monitor/types";

function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

export class SupabaseMonitorStore implements MonitorStore {
  constructor(private readonly db: SupabaseClient) {}

  async listDecisionsSince(since: Date) {
    return must(
      await this.db.from("decisions").select("action, decided_at").gte("decided_at", since.toISOString()),
      "Could not read decisions",
    ) as { action: string; decided_at: string }[];
  }

  async countAuditSince(action: string, since: Date) {
    const result = await this.db.from("audit_log").select("id", { count: "exact", head: true }).eq("action", action).gte("at", since.toISOString());
    if (result.error) throw new Error(`Could not read audit log: ${result.error.message}`);
    return result.count ?? 0;
  }

  async saveActualLoss(entry: { period: string; stockout_loss_lakh: number; overstock_loss_lakh: number; entered_by: string }) {
    const existing = must(await this.db.from("loss_tracking").select("source").eq("period", entry.period).maybeSingle(), "Could not read losses");
    if (existing && existing.source !== "actual") {
      throw new Error(`${entry.period} is a baseline period and cannot be overwritten. Enter the current quarter instead.`);
    }
    must(await this.db.from("loss_tracking").upsert({ ...entry, source: "actual" }, { onConflict: "period" }), "Could not save loss");
  }

  async getKillSwitch(): Promise<KillSwitchState> {
    const row = must(
      await this.db.from("system_state").select("is_active, reason, tripped_at, resumed_at, resumed_by").eq("key", "kill_switch").maybeSingle(),
      "Could not read kill switch",
    );
    return { active: row?.is_active ?? false, reason: row?.reason ?? null, tripped_at: row?.tripped_at ?? null, resumed_at: row?.resumed_at ?? null, resumed_by: row?.resumed_by ?? null };
  }

  async tripKillSwitch(reason: string, at: Date) {
    must(
      await this.db.from("system_state").update({ is_active: true, reason, tripped_at: at.toISOString(), resumed_at: null, resumed_by: null }).eq("key", "kill_switch"),
      "Could not turn the kill switch on",
    );
  }

  async resumeKillSwitch(by: string, at: Date) {
    must(
      await this.db.from("system_state").update({ is_active: false, resumed_at: at.toISOString(), resumed_by: by }).eq("key", "kill_switch"),
      "Could not turn the kill switch off",
    );
  }

  async audit(entry: AuditEntry) {
    must(await this.db.from("audit_log").insert(entry), "Could not write audit log");
  }
}

export interface MonitorView {
  rejection: RejectionStatus;
  minLines: number;
  killSwitch: KillSwitchState;
  losses: LossEntry[];
  /** The most recent actual (not baseline) loss entry, if any. */
  latestActual: (LossEntry & { level: LossLevel }) | null;
  thresholds: Thresholds;
}

export async function loadMonitor(db: SupabaseClient, thresholds: Thresholds, now: Date = new Date()): Promise<MonitorView> {
  const store = new SupabaseMonitorStore(db);
  const [rejection, killSwitch, losses] = await Promise.all([
    currentRejectionStatus(store, thresholds.REJECTION_MIN_LINES, now),
    store.getKillSwitch(),
    db.from("loss_tracking").select("period, stockout_loss_lakh, overstock_loss_lakh, total_loss_lakh, source, entered_by, created_at").order("created_at", { ascending: false }),
  ]);
  const entries = must(losses, "Could not read losses") as LossEntry[];
  const latest = entries.find((e) => e.source === "actual") ?? null;

  return {
    rejection,
    minLines: thresholds.REJECTION_MIN_LINES,
    killSwitch,
    losses: entries,
    latestActual: latest ? { ...latest, level: lossLevel(Number(latest.total_loss_lakh), thresholds) } : null,
    thresholds,
  };
}
