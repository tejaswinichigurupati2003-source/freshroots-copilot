"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ACTORS, decide, type Actor } from "@/lib/approval/decide";
import { getDb } from "@/lib/db/client";
import { SupabaseDecisionStore } from "@/lib/db/decision-store";
import { SupabaseMonitorStore } from "@/lib/db/monitor-store";
import { SupabasePushStore } from "@/lib/db/push-store";
import { resumeKillSwitch } from "@/lib/monitor/kill-switch";
import { recordLoss } from "@/lib/monitor/loss";
import { checkRejectionWarning } from "@/lib/monitor/rejection";
import { getThresholds } from "@/lib/monitor/types";
import { createGateway } from "@/lib/zoho/factory";
import { pushApproved } from "@/lib/zoho/push";

export interface DecisionState {
  error?: string;
  message?: string;
}

const ACTING_AS_COOKIE = "acting_as";

/** Who is using the dashboard. A cookie stands in for real login. */
export async function getActingAs(): Promise<Actor> {
  const value = (await cookies()).get(ACTING_AS_COOKIE)?.value;
  return ACTORS.find((a) => a === value) ?? "Raghav";
}

export async function setActingAs(formData: FormData) {
  const value = formData.get("actor");
  if (ACTORS.some((a) => a === value)) {
    (await cookies()).set(ACTING_AS_COOKIE, String(value), { path: "/", sameSite: "lax", httpOnly: true });
  }
  revalidatePath("/");
}

export async function decideAction(_previous: DecisionState, formData: FormData): Promise<DecisionState> {
  const field = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v : undefined;
  };

  const result = await decide(new SupabaseDecisionStore(getDb()), {
    recommendationId: field("recommendationId") ?? "",
    actor: await getActingAs(),
    action: (field("action") ?? "") as "approve",
    quantity: field("quantity"),
    reason: field("reason"),
  });

  if (!result.ok) return { error: result.error };
  // Early warning: records an audit entry when the rejection rate is high. The decision is already saved either way.
  await checkRejectionWarning(new SupabaseMonitorStore(getDb()), getThresholds().REJECTION_MIN_LINES, new Date());
  revalidatePath("/");
  return { message: result.message };
}

export async function pushToZoho(): Promise<DecisionState> {
  try {
    const result = await pushApproved(await getActingAs(), { store: new SupabasePushStore(getDb()), gateway: createGateway() });
    revalidatePath("/");
    if (result.status === "blocked") return { error: result.message };

    const parts = result.created.map((c) => `${c.externalId} (${c.lineCount} lines)`);
    const notes = [
      result.skippedDuplicates > 0 ? `${result.skippedDuplicates} already sent` : "",
      result.skippedZeroQty > 0 ? `${result.skippedZeroQty} with quantity 0 skipped` : "",
    ].filter(Boolean);
    if (result.failed.length > 0) {
      return { error: `Could not send ${result.failed.map((f) => `${f.distributorId}: ${f.message}`).join("; ")}.${parts.length ? ` Sent: ${parts.join(", ")}.` : ""}` };
    }
    if (parts.length === 0) return { message: `Nothing new to send.${notes.length ? ` (${notes.join(", ")})` : ""}` };
    return { message: `Draft POs created: ${parts.join(", ")}.${notes.length ? ` (${notes.join(", ")})` : ""}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send to Zoho." };
  }
}

export async function submitLoss(_previous: DecisionState, formData: FormData): Promise<DecisionState> {
  const field = (name: string) => String(formData.get(name) ?? "");
  const result = await recordLoss(
    new SupabaseMonitorStore(getDb()),
    { period: field("period"), stockoutLakh: field("stockoutLakh"), overstockLakh: field("overstockLakh"), actor: await getActingAs() },
    getThresholds(),
    new Date(),
  );
  revalidatePath("/");
  revalidatePath("/monitor");
  return result.ok ? { message: result.message } : { error: result.error };
}

export async function resumeAction(_previous: DecisionState, formData: FormData): Promise<DecisionState> {
  const result = await resumeKillSwitch(
    new SupabaseMonitorStore(getDb()),
    { pin: String(formData.get("pin") ?? ""), actor: await getActingAs() },
    process.env.KILL_SWITCH_PIN,
    new Date(),
  );
  revalidatePath("/");
  revalidatePath("/monitor");
  return result.ok ? { message: result.message } : { error: result.error };
}
