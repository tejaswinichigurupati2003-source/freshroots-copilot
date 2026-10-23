import type { AuditEntry } from "../ingest/pipeline";
import type { DraftPoLine, PurchaseOrderGateway } from "./types";

export interface ApprovedLine {
  recommendation_id: string;
  run_id: string;
  sku_id: string;
  sku_name: string;
  distributor_id: string;
  final_qty: number;
}

export interface DraftRecord {
  run_id: string;
  distributor_id: string;
  lines: { recommendation_id: string; sku_id: string; sku_name: string; quantity: number }[];
  mode: "mock" | "live";
  external_id: string;
  response: Record<string, unknown>;
}

export interface PushStore {
  getKillSwitch(): Promise<{ active: boolean; reason: string | null }>;
  /** Approved, not yet pushed lines of the latest completed run. */
  listApprovedLines(): Promise<ApprovedLine[]>;
  /** SKUs that already sit in a draft for this run. */
  listPushedSkus(runId: string): Promise<Set<string>>;
  /** Marks the lines as pushed and returns the ids that were still approved. A second click gets none. */
  claimLines(recommendationIds: string[]): Promise<string[]>;
  /** Puts claimed lines back to approved after a failed push. */
  releaseLines(recommendationIds: string[]): Promise<void>;
  saveDraft(draft: DraftRecord): Promise<void>;
  audit(entry: AuditEntry): Promise<void>;
}

export interface PushPlan {
  /** One group per run and distributor. */
  groups: { runId: string; distributorId: string; lines: ApprovedLine[] }[];
  skippedDuplicates: ApprovedLine[];
  skippedZeroQty: ApprovedLine[];
}

/** Pure: groups approved lines by distributor, skipping zero quantities and SKUs already pushed in the run. */
export function planPush(lines: ApprovedLine[], pushedSkusByRun: Map<string, Set<string>>): PushPlan {
  const groups = new Map<string, PushPlan["groups"][number]>();
  const plan: PushPlan = { groups: [], skippedDuplicates: [], skippedZeroQty: [] };

  for (const line of lines) {
    if (pushedSkusByRun.get(line.run_id)?.has(line.sku_id)) {
      plan.skippedDuplicates.push(line);
    } else if (line.final_qty <= 0) {
      plan.skippedZeroQty.push(line);
    } else {
      const key = `${line.run_id}|${line.distributor_id}`;
      const group = groups.get(key) ?? { runId: line.run_id, distributorId: line.distributor_id, lines: [] };
      group.lines.push(line);
      groups.set(key, group);
    }
  }
  plan.groups = [...groups.values()];
  return plan;
}

export type PushResult =
  | { status: "blocked"; message: string }
  | {
      status: "done";
      created: { distributorId: string; externalId: string; lineCount: number }[];
      failed: { distributorId: string; message: string }[];
      skippedDuplicates: number;
      skippedZeroQty: number;
    };

/** Sends approved lines to Zoho as one draft PO per distributor. Never runs while the kill switch is on. */
export async function pushApproved(actor: string, deps: { store: PushStore; gateway: PurchaseOrderGateway }): Promise<PushResult> {
  const { store, gateway } = deps;

  const killSwitch = await store.getKillSwitch();
  if (killSwitch.active) {
    const message = `Kill switch is on${killSwitch.reason ? `: ${killSwitch.reason.replace(/\.$/, "")}` : ""}. Nothing was sent to Zoho.`;
    await store.audit({ actor, action: "zoho_push_blocked", details: { reason: "kill_switch" } });
    return { status: "blocked", message };
  }

  const approved = await store.listApprovedLines();
  const pushedSkusByRun = new Map<string, Set<string>>();
  for (const runId of new Set(approved.map((l) => l.run_id))) pushedSkusByRun.set(runId, await store.listPushedSkus(runId));
  const plan = planPush(approved, pushedSkusByRun);

  await store.audit({
    actor,
    action: "zoho_push_requested",
    details: { mode: gateway.mode, distributors: plan.groups.length, skippedDuplicates: plan.skippedDuplicates.length, skippedZeroQty: plan.skippedZeroQty.length },
  });

  const result: Extract<PushResult, { status: "done" }> = {
    status: "done",
    created: [],
    failed: [],
    skippedDuplicates: plan.skippedDuplicates.length,
    skippedZeroQty: plan.skippedZeroQty.length,
  };

  for (const group of plan.groups) {
    const claimed = new Set(await store.claimLines(group.lines.map((l) => l.recommendation_id)));
    const lines = group.lines.filter((l) => claimed.has(l.recommendation_id));
    if (lines.length === 0) continue;

    const draftLines: DraftPoLine[] = lines.map((l) => ({ recommendationId: l.recommendation_id, skuId: l.sku_id, skuName: l.sku_name, quantity: l.final_qty }));
    try {
      const created = await gateway.createDraftPurchaseOrder({ runId: group.runId, distributorId: group.distributorId, lines: draftLines });
      await store.saveDraft({
        run_id: group.runId,
        distributor_id: group.distributorId,
        lines: draftLines.map((l) => ({ recommendation_id: l.recommendationId, sku_id: l.skuId, sku_name: l.skuName, quantity: l.quantity })),
        mode: gateway.mode,
        external_id: created.externalId,
        response: created.response,
      });
      await store.audit({
        actor,
        action: "zoho_po_draft_created",
        entity: "zoho_draft",
        entity_id: created.externalId,
        details: { distributor_id: group.distributorId, mode: gateway.mode, lines: draftLines.map((l) => ({ sku_id: l.skuId, quantity: l.quantity })) },
      });
      result.created.push({ distributorId: group.distributorId, externalId: created.externalId, lineCount: lines.length });
    } catch (err) {
      await store.releaseLines(lines.map((l) => l.recommendation_id));
      const message = err instanceof Error ? err.message : String(err);
      await store.audit({ actor: "system", action: "zoho_push_failed", details: { distributor_id: group.distributorId, message } });
      result.failed.push({ distributorId: group.distributorId, message });
    }
  }

  return result;
}
