import { z } from "zod";
import type { MonitorStore, Thresholds } from "./types";

export type LossLevel = "ok" | "warn" | "stop";

/** Strictly above the limit: exactly 50 lakh does not stop the system, 50.01 does. */
export function lossLevel(totalLakh: number, t: Pick<Thresholds, "LOSS_WARN_LAKH" | "LOSS_STOP_LAKH">): LossLevel {
  if (totalLakh > t.LOSS_STOP_LAKH) return "stop";
  if (totalLakh > t.LOSS_WARN_LAKH) return "warn";
  return "ok";
}

const lakh = z.coerce.number({ message: "Enter a number." }).min(0, "Loss cannot be negative.").max(10_000, "That looks too large. Enter the loss in lakh.");

const lossInputSchema = z.object({
  period: z.string().trim().min(3, "Enter the period, for example Oct-Dec 2026.").max(40),
  stockoutLakh: lakh,
  overstockLakh: lakh,
  actor: z.string().min(1),
});

export type LossResult = { ok: true; total: number; level: LossLevel; tripped: boolean; message: string } | { ok: false; error: string };

/** Saves a period's actual loss, writes the audit entry, and turns the kill switch on above the stop limit (lagging, automatic). */
export async function recordLoss(
  store: MonitorStore,
  input: { period: string; stockoutLakh: string; overstockLakh: string; actor: string },
  thresholds: Thresholds,
  now: Date,
): Promise<LossResult> {
  const parsed = lossInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { period, stockoutLakh, overstockLakh, actor } = parsed.data;

  try {
    await store.saveActualLoss({ period, stockout_loss_lakh: stockoutLakh, overstock_loss_lakh: overstockLakh, entered_by: actor });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the loss." };
  }

  const total = Math.round((stockoutLakh + overstockLakh) * 100) / 100;
  const level = lossLevel(total, thresholds);
  await store.audit({ actor, action: "loss_entered", entity: "loss_tracking", entity_id: period, details: { stockoutLakh, overstockLakh, total, level } });

  let tripped = false;
  if (level === "stop") {
    const state = await store.getKillSwitch();
    if (!state.active) {
      const reason = `Loss for ${period} is ${total} lakh, above the ${thresholds.LOSS_STOP_LAKH} lakh limit.`;
      await store.tripKillSwitch(reason, now);
      await store.audit({ actor: "system", action: "kill_switch_tripped", entity: "system_state", entity_id: "kill_switch", details: { reason, total, period } });
      tripped = true;
    }
  } else if (level === "warn") {
    await store.audit({ actor: "system", action: "loss_warning", entity: "loss_tracking", entity_id: period, details: { total, warnAbove: thresholds.LOSS_WARN_LAKH } });
  }

  const message =
    level === "stop"
      ? `Saved. Total ${total} lakh is above ${thresholds.LOSS_STOP_LAKH} lakh, so the kill switch is ON. Runs and Zoho pushes are paused.`
      : level === "warn"
        ? `Saved. Total ${total} lakh is above the ${thresholds.LOSS_WARN_LAKH} lakh warning line.`
        : `Saved. Total ${total} lakh.`;
  return { ok: true, total, level, tripped, message };
}
