import { z } from "zod";
import type { AuditEntry } from "../ingest/pipeline";
import { can, denial } from "./roles";
import { needsReview } from "./review";

export const ACTORS = ["Raghav", "Deepa"] as const;
export type Actor = (typeof ACTORS)[number];

export const MIN_REJECT_REASON = 5;

const baseSchema = z.object({
  recommendationId: z.string().min(1),
  actor: z.enum(ACTORS, { message: "Choose who you are acting as." }),
  action: z.enum(["approve", "edit", "reject"]),
  quantity: z.string().trim().optional(),
  reason: z.string().trim().optional(),
});

export type DecisionInput = z.input<typeof baseSchema>;

export interface RecommendationForDecision {
  id: string;
  sku_id: string;
  flag: string;
  recommended_qty: number;
  status: string;
  edge_case_type: string | null;
  signals: Record<string, unknown>;
}

export interface DecisionRecord {
  recommendation_id: string;
  sku_id: string;
  decided_by: Actor;
  action: "approved" | "edited" | "rejected";
  original_qty: number;
  final_qty: number;
  reason: string | null;
}

/** Thrown by a store when the recommendation already has a decision (lost a race with another click). */
export class AlreadyDecidedError extends Error {}

export interface DecisionStore {
  getRecommendation(id: string): Promise<RecommendationForDecision | null>;
  saveDecision(decision: DecisionRecord, newStatus: "approved" | "rejected"): Promise<void>;
  audit(entry: AuditEntry): Promise<void>;
}

export type DecisionResult = { ok: true; message: string } | { ok: false; error: string };

const fail = (error: string): DecisionResult => ({ ok: false, error });

/** Validates a decision from the dashboard, records it, and writes the audit entry. Quantities come from the engine; this only records Raghav's call. */
export async function decide(store: DecisionStore, raw: DecisionInput): Promise<DecisionResult> {
  const parsed = baseSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const input = parsed.data;
  if (!can(input.actor, "decide")) return fail(denial(input.actor, "decide"));

  let editedQty: number | null = null;
  if (input.action === "edit") {
    if (!input.quantity || !/^\d+$/.test(input.quantity)) return fail("Enter a whole number of 0 or more.");
    editedQty = Number(input.quantity);
  }
  if (input.action === "reject" && (input.reason?.length ?? 0) < MIN_REJECT_REASON) {
    return fail(`Add a reason of at least ${MIN_REJECT_REASON} characters to reject.`);
  }

  const rec = await store.getRecommendation(input.recommendationId);
  if (!rec) return fail("That recommendation no longer exists. Refresh the page.");
  if (rec.status !== "pending") return fail("This line has already been decided.");
  if (!needsReview(rec)) return fail("Rows flagged OK need no approval.");

  let action: DecisionRecord["action"];
  let finalQty: number;
  if (input.action === "reject") {
    action = "rejected";
    finalQty = 0;
  } else if (editedQty !== null && editedQty !== rec.recommended_qty) {
    action = "edited";
    finalQty = editedQty;
  } else {
    action = "approved";
    finalQty = rec.recommended_qty;
  }

  const decision: DecisionRecord = {
    recommendation_id: rec.id,
    sku_id: rec.sku_id,
    decided_by: input.actor,
    action,
    original_qty: rec.recommended_qty,
    final_qty: finalQty,
    reason: input.reason || null,
  };

  try {
    await store.saveDecision(decision, action === "rejected" ? "rejected" : "approved");
  } catch (err) {
    if (err instanceof AlreadyDecidedError) return fail("This line has already been decided.");
    throw err;
  }

  await store.audit({
    actor: input.actor,
    action: `decision_${action}`,
    entity: "recommendation",
    entity_id: rec.id,
    details: { sku_id: rec.sku_id, original_qty: rec.recommended_qty, final_qty: finalQty, reason: decision.reason },
  });

  const verb = { approved: "Approved", edited: "Approved with new quantity", rejected: "Rejected" }[action];
  return { ok: true, message: `${verb}: ${rec.sku_id}, quantity ${finalQty}.` };
}
