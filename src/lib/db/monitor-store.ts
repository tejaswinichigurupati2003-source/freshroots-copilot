import type { AuditEntry } from "../ingest/pipeline";
import { lossLevel, type LossLevel } from "../monitor/loss";
import { currentRejectionStatus, type RejectionStatus } from "../monitor/rejection";
import type { KillSwitchState, LossEntry, MonitorStore, Thresholds } from "../monitor/types";
import type { Db } from "./client";
import { insertRows } from "./sql";

export class DbMonitorStore implements MonitorStore {
  constructor(private readonly db: Db) {}

  listDecisionsSince(since: Date) {
    return this.db.query<{ action: string; decided_at: string }>("select action, decided_at from decisions where decided_at >= $1", [since.toISOString()]);
  }

  async countAuditSince(action: string, since: Date) {
    const [row] = await this.db.query<{ n: number }>("select count(*)::int as n from audit_log where action = $1 and at >= $2", [action, since.toISOString()]);
    return row?.n ?? 0;
  }

  async saveActualLoss(entry: { period: string; stockout_loss_lakh: number; overstock_loss_lakh: number; entered_by: string }) {
    const [existing] = await this.db.query<{ source: string }>("select source from loss_tracking where period = $1", [entry.period]);
    if (existing && existing.source !== "actual") {
      throw new Error(`${entry.period} is a baseline period and cannot be overwritten. Enter the current quarter instead.`);
    }
    await this.db.query(
      `insert into loss_tracking (period, stockout_loss_lakh, overstock_loss_lakh, source, entered_by)
       values ($1, $2, $3, 'actual', $4)
       on conflict (period) do update
         set stockout_loss_lakh = excluded.stockout_loss_lakh, overstock_loss_lakh = excluded.overstock_loss_lakh,
             entered_by = excluded.entered_by, created_at = now()`,
      [entry.period, entry.stockout_loss_lakh, entry.overstock_loss_lakh, entry.entered_by],
    );
  }

  async getKillSwitch(): Promise<KillSwitchState> {
    const [row] = await this.db.query<KillSwitchState & { is_active: boolean }>(
      "select is_active, reason, tripped_at, resumed_at, resumed_by from system_state where key = 'kill_switch'",
    );
    return { active: row?.is_active ?? false, reason: row?.reason ?? null, tripped_at: row?.tripped_at ?? null, resumed_at: row?.resumed_at ?? null, resumed_by: row?.resumed_by ?? null };
  }

  async tripKillSwitch(reason: string, at: Date) {
    await this.db.query(
      "update system_state set is_active = true, reason = $1, tripped_at = $2, resumed_at = null, resumed_by = null where key = 'kill_switch'",
      [reason, at.toISOString()],
    );
  }

  async resumeKillSwitch(by: string, at: Date) {
    await this.db.query("update system_state set is_active = false, resumed_at = $2, resumed_by = $1 where key = 'kill_switch'", [by, at.toISOString()]);
  }

  async audit(entry: AuditEntry) {
    await insertRows(this.db, "audit_log", [{ actor: entry.actor, action: entry.action, entity: entry.entity ?? null, entity_id: entry.entity_id ?? null, details: entry.details ?? {} }]);
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

export async function loadMonitor(db: Db, thresholds: Thresholds, now: Date = new Date()): Promise<MonitorView> {
  const store = new DbMonitorStore(db);
  const [rejection, killSwitch, entries] = await Promise.all([
    currentRejectionStatus(store, thresholds.REJECTION_MIN_LINES, now),
    store.getKillSwitch(),
    db.query<LossEntry>(
      "select period, stockout_loss_lakh, overstock_loss_lakh, total_loss_lakh, source, entered_by, created_at from loss_tracking order by created_at desc, id desc",
    ),
  ]);
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
