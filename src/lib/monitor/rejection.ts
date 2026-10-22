import type { MonitorStore } from "./types";

export const ROLLING_DAYS = 30;
/** The early warning fires when the rejection rate is strictly above this. */
export const REJECTION_WARNING_ABOVE = 0.5;
const AUDIT_DEDUPE_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RejectionStatus {
  decided: number;
  rejected: number;
  /** Null until enough lines have been decided. */
  rate: number | null;
  evaluated: boolean;
  warning: boolean;
}

/** Pure: rejection rate over decisions already filtered to the rolling window. */
export function rejectionStatus(decisions: { action: string }[], minLines: number): RejectionStatus {
  const decided = decisions.length;
  const rejected = decisions.filter((d) => d.action === "rejected").length;
  const evaluated = decided >= minLines;
  const rate = evaluated ? rejected / decided : null;
  return { decided, rejected, rate, evaluated, warning: rate !== null && rate > REJECTION_WARNING_ABOVE };
}

export async function currentRejectionStatus(store: MonitorStore, minLines: number, now: Date): Promise<RejectionStatus> {
  const since = new Date(now.getTime() - ROLLING_DAYS * DAY_MS);
  return rejectionStatus(await store.listDecisionsSince(since), minLines);
}

/** Early warning (manual). Writes one audit entry per hour while the rate stays high. The system keeps running. */
export async function checkRejectionWarning(store: MonitorStore, minLines: number, now: Date): Promise<RejectionStatus> {
  const status = await currentRejectionStatus(store, minLines, now);
  if (status.warning) {
    const recent = await store.countAuditSince("early_warning_rejection_rate", new Date(now.getTime() - AUDIT_DEDUPE_MS));
    if (recent === 0) {
      await store.audit({
        actor: "system",
        action: "early_warning_rejection_rate",
        details: { rate: status.rate, rejected: status.rejected, decided: status.decided, windowDays: ROLLING_DAYS },
      });
    }
  }
  return status;
}
