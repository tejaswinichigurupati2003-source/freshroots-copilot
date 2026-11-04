"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ACTORS, decide } from "@/lib/approval/decide";
import { can, denial } from "@/lib/approval/roles";
import { getDb } from "@/lib/db/client";
import { DbDecisionStore } from "@/lib/db/decision-store";
import { DbMonitorStore } from "@/lib/db/monitor-store";
import { DbPushStore } from "@/lib/db/push-store";
import { resumeKillSwitch } from "@/lib/monitor/kill-switch";
import { recordLoss } from "@/lib/monitor/loss";
import { checkRejectionWarning } from "@/lib/monitor/rejection";
import { getThresholds } from "@/lib/monitor/types";
import { ACTING_AS_COOKIE, getActingAs } from "@/lib/session";
import { createGateway } from "@/lib/zoho/factory";
import { pushApproved } from "@/lib/zoho/push";

export interface DecisionState {
  error?: string;
  message?: string;
}

export async function setActingAs(actor: string) {
  if (ACTORS.some((a) => a === actor)) {
    (await cookies()).set(ACTING_AS_COOKIE, actor, { path: "/", sameSite: "lax", httpOnly: true });
  }
  // Every page shows the selector and role-specific content, so refresh them all.
  revalidatePath("/", "layout");
}

export async function decideAction(_previous: DecisionState, formData: FormData): Promise<DecisionState> {
  const field = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v : undefined;
  };

  const result = await decide(new DbDecisionStore(getDb()), {
    recommendationId: field("recommendationId") ?? "",
    actor: await getActingAs(),
    action: (field("action") ?? "") as "approve",
    quantity: field("quantity"),
    reason: field("reason"),
  });

  if (!result.ok) return { error: result.error };
  // Early warning: records an audit entry when the rejection rate is high. The decision is already saved either way.
  await checkRejectionWarning(new DbMonitorStore(getDb()), getThresholds().REJECTION_MIN_LINES, new Date());
  revalidatePath("/");
  return { message: result.message };
}

export async function pushToZoho(): Promise<DecisionState> {
  try {
    const actor = await getActingAs();
    if (!can(actor, "push")) return { error: denial(actor, "push") };
    const result = await pushApproved(actor, { store: new DbPushStore(getDb()), gateway: createGateway() });
    revalidatePath("/");
    if (result.status === "blocked") return { error: result.message };

    const parts = result.created.map((c) => `${c.externalId} (${c.lineCount} lines)`);
    const notes = [
      result.skippedDuplicates > 0 ? `${result.skippedDuplicates} already sent` : "",
      result.skippedZeroQty > 0 ? `${result.skippedZeroQty} with quantity 0 skipped` : "",
    ].filter(Boolean);
    if (result.failed.length > 0) {
      return { error: `Could not send ${result.failed.map((f) => `${f.distributorId}: ${f.message.replace(/\.$/, "")}`).join("; ")}.${parts.length ? ` Sent: ${parts.join(", ")}.` : ""}` };
    }
    if (parts.length === 0) return { message: `Nothing new to send.${notes.length ? ` (${notes.join(", ")})` : ""}` };
    return { message: `Draft POs created: ${parts.join(", ")}.${notes.length ? ` (${notes.join(", ")})` : ""}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send to Zoho." };
  }
}

export async function submitLoss(_previous: DecisionState, formData: FormData): Promise<DecisionState> {
  const field = (name: string) => String(formData.get(name) ?? "");
  const actor = await getActingAs();
  if (!can(actor, "enter_loss")) return { error: denial(actor, "enter_loss") };
  const result = await recordLoss(
    new DbMonitorStore(getDb()),
    { period: field("period"), stockoutLakh: field("stockoutLakh"), overstockLakh: field("overstockLakh"), actor },
    getThresholds(),
    new Date(),
  );
  revalidatePath("/");
  revalidatePath("/monitor");
  return result.ok ? { message: result.message } : { error: result.error };
}

export async function resumeAction(_previous: DecisionState, formData: FormData): Promise<DecisionState> {
  const actor = await getActingAs();
  if (!can(actor, "resume")) return { error: denial(actor, "resume") };
  const result = await resumeKillSwitch(
    new DbMonitorStore(getDb()),
    { pin: String(formData.get("pin") ?? ""), actor },
    process.env.KILL_SWITCH_PIN,
    new Date(),
  );
  revalidatePath("/");
  revalidatePath("/monitor");
  return result.ok ? { message: result.message } : { error: result.error };
}
