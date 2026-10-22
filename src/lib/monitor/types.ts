import { z } from "zod";
import type { AuditEntry } from "../ingest/pipeline";

export const thresholdsSchema = z.object({
  LOSS_WARN_LAKH: z.coerce.number().positive().default(40),
  LOSS_STOP_LAKH: z.coerce.number().positive().default(50),
  BASELINE_LOSS_LAKH: z.coerce.number().positive().default(30.75),
  /** Decided lines needed in the window before the rejection rate counts. The brief says 20. Lower it only for demos. */
  REJECTION_MIN_LINES: z.coerce.number().int().positive().default(20),
});

export type Thresholds = z.infer<typeof thresholdsSchema>;

export function getThresholds(env: Record<string, string | undefined> = process.env): Thresholds {
  const clean = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ""));
  return thresholdsSchema.parse(clean);
}

export interface KillSwitchState {
  active: boolean;
  reason: string | null;
  tripped_at: string | null;
  resumed_at: string | null;
  resumed_by: string | null;
}

export interface LossEntry {
  period: string;
  stockout_loss_lakh: number;
  overstock_loss_lakh: number;
  total_loss_lakh: number;
  source: string;
  entered_by: string | null;
  created_at: string;
}

export interface MonitorStore {
  listDecisionsSince(since: Date): Promise<{ action: string; decided_at: string }[]>;
  countAuditSince(action: string, since: Date): Promise<number>;
  /** Saves an actual loss for a period. Throws if the period belongs to the baseline seed. */
  saveActualLoss(entry: { period: string; stockout_loss_lakh: number; overstock_loss_lakh: number; entered_by: string }): Promise<void>;
  getKillSwitch(): Promise<KillSwitchState>;
  tripKillSwitch(reason: string, at: Date): Promise<void>;
  resumeKillSwitch(by: string, at: Date): Promise<void>;
  audit(entry: AuditEntry): Promise<void>;
}
