import { createHash, timingSafeEqual } from "node:crypto";
import type { MonitorStore } from "./types";

export const MAX_PIN_ATTEMPTS = 5;
export const PIN_WINDOW_MINUTES = 10;

/** Constant-time comparison. Hashing first gives both sides the same length. */
export function pinMatches(given: string, expected: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

export type ResumeResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Turns the kill switch off when the PIN is right. Wrong PINs are written to audit_log and counted there,
 * so the limit of 5 attempts per 10 minutes holds across serverless instances.
 */
export async function resumeKillSwitch(
  store: MonitorStore,
  input: { pin: string; actor: string },
  expectedPin: string | undefined,
  now: Date,
): Promise<ResumeResult> {
  if (!expectedPin) return { ok: false, error: "No resume PIN is set. Add KILL_SWITCH_PIN to .env.local." };

  const state = await store.getKillSwitch();
  if (!state.active) return { ok: false, error: "The kill switch is not on." };

  const since = new Date(now.getTime() - PIN_WINDOW_MINUTES * 60_000);
  if ((await store.countAuditSince("kill_switch_resume_failed", since)) >= MAX_PIN_ATTEMPTS) {
    return { ok: false, error: `Too many wrong PINs. Try again in ${PIN_WINDOW_MINUTES} minutes.` };
  }

  if (!pinMatches(input.pin, expectedPin)) {
    await store.audit({ actor: input.actor, action: "kill_switch_resume_failed", entity: "system_state", entity_id: "kill_switch" });
    return { ok: false, error: "Wrong PIN." };
  }

  await store.resumeKillSwitch(input.actor, now);
  await store.audit({ actor: input.actor, action: "kill_switch_resumed", entity: "system_state", entity_id: "kill_switch" });
  return { ok: true, message: `Kill switch is off. Resumed by ${input.actor}.` };
}
