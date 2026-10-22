import { describe, expect, it } from "vitest";
import type { AuditEntry } from "../ingest/pipeline";
import { MockGateway } from "./mock-gateway";
import { planPush, pushApproved, type ApprovedLine, type DraftRecord, type PushStore } from "./push";
import type { DraftPo, PurchaseOrderGateway } from "./types";

const line = (sku: string, dist: string, qty: number, run = "run-1"): ApprovedLine => ({
  recommendation_id: `rec-${sku}`,
  run_id: run,
  sku_id: sku,
  sku_name: `Name ${sku}`,
  distributor_id: dist,
  final_qty: qty,
});

function memoryStore(lines: ApprovedLine[], killSwitch = { active: false, reason: null as string | null }) {
  const status = new Map(lines.map((l) => [l.recommendation_id, "approved"]));
  const drafts: DraftRecord[] = [];
  const audit: AuditEntry[] = [];
  const store: PushStore = {
    getKillSwitch: async () => killSwitch,
    listApprovedLines: async () => lines.filter((l) => status.get(l.recommendation_id) === "approved"),
    listPushedSkus: async (runId) => new Set(drafts.filter((d) => d.run_id === runId).flatMap((d) => d.lines.map((l) => l.sku_id))),
    claimLines: async (ids) => {
      const claimed = ids.filter((id) => status.get(id) === "approved");
      claimed.forEach((id) => status.set(id, "pushed"));
      return claimed;
    },
    releaseLines: async (ids) => ids.forEach((id) => status.set(id, "approved")),
    saveDraft: async (d) => void drafts.push(d),
    audit: async (e) => void audit.push(e),
  };
  return { store, drafts, audit, status };
}

function countingGateway(failFor: string[] = []) {
  const calls: DraftPo[] = [];
  const inner = new MockGateway();
  const gateway: PurchaseOrderGateway = {
    mode: "mock",
    listOpenPurchaseOrders: () => inner.listOpenPurchaseOrders(),
    createDraftPurchaseOrder: async (po) => {
      calls.push(po);
      if (failFor.includes(po.distributorId)) throw new Error("Zoho said no");
      return inner.createDraftPurchaseOrder(po);
    },
  };
  return { gateway, calls };
}

const approved = [line("SKU001", "DIST001", 750), line("SKU007", "DIST001", 400), line("SKU004", "DIST002", 150)];

describe("pushApproved", () => {
  it("is blocked while the kill switch is on and never calls the gateway", async () => {
    const { store, drafts, audit } = memoryStore(approved, { active: true, reason: "Loss above 50 lakh" });
    const { gateway, calls } = countingGateway();
    const result = await pushApproved("Raghav", { store, gateway });

    expect(result).toMatchObject({ status: "blocked" });
    expect(result.status === "blocked" && result.message).toContain("Loss above 50 lakh");
    expect(calls).toHaveLength(0);
    expect(drafts).toHaveLength(0);
    expect(audit.map((a) => a.action)).toEqual(["zoho_push_blocked"]);
  });

  it("creates one draft PO per distributor and saves each as a draft", async () => {
    const { store, drafts, status } = memoryStore(approved);
    const { gateway, calls } = countingGateway();
    const result = await pushApproved("Raghav", { store, gateway });

    expect(calls.map((c) => [c.distributorId, c.lines.map((l) => l.skuId)])).toEqual([
      ["DIST001", ["SKU001", "SKU007"]],
      ["DIST002", ["SKU004"]],
    ]);
    expect(result).toMatchObject({ status: "done", failed: [] });
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({ mode: "mock", distributor_id: "DIST001" });
    expect([...status.values()]).toEqual(["pushed", "pushed", "pushed"]);
  });

  it("skips a SKU already pushed in the run when pushed again", async () => {
    const { store, drafts } = memoryStore(approved);
    const { gateway, calls } = countingGateway();
    await pushApproved("Raghav", { store, gateway });
    const second = await pushApproved("Raghav", { store, gateway });

    expect(calls).toHaveLength(2);
    expect(drafts).toHaveLength(2);
    expect(second).toMatchObject({ status: "done", created: [] });
  });

  it("skips a SKU that is already in a draft even if its line is still marked approved", async () => {
    const { store, drafts } = memoryStore(approved);
    drafts.push({ run_id: "run-1", distributor_id: "DIST002", lines: [{ recommendation_id: "rec-SKU004", sku_id: "SKU004", sku_name: "x", quantity: 150 }], mode: "mock", external_id: "E", response: {} });
    const { gateway, calls } = countingGateway();
    const result = await pushApproved("Raghav", { store, gateway });

    expect(calls.map((c) => c.distributorId)).toEqual(["DIST001"]);
    expect(result).toMatchObject({ skippedDuplicates: 1 });
  });

  it("skips lines with quantity 0", async () => {
    const { store } = memoryStore([line("SKU006", "DIST003", 0), line("SKU001", "DIST001", 750)]);
    const { gateway, calls } = countingGateway();
    const result = await pushApproved("Raghav", { store, gateway });
    expect(calls.map((c) => c.distributorId)).toEqual(["DIST001"]);
    expect(result).toMatchObject({ skippedZeroQty: 1 });
  });

  it("releases the lines of a failed distributor and still sends the others", async () => {
    const { store, status } = memoryStore(approved);
    const { gateway } = countingGateway(["DIST001"]);
    const result = await pushApproved("Raghav", { store, gateway });

    expect(result).toMatchObject({ status: "done", failed: [{ distributorId: "DIST001", message: "Zoho said no" }] });
    expect(status.get("rec-SKU001")).toBe("approved");
    expect(status.get("rec-SKU004")).toBe("pushed");
  });

  it("does nothing when another click already claimed the lines", async () => {
    const { store } = memoryStore(approved);
    store.claimLines = async () => [];
    const { gateway, calls } = countingGateway();
    await pushApproved("Raghav", { store, gateway });
    expect(calls).toHaveLength(0);
  });
});

describe("planPush", () => {
  it("keeps runs apart when grouping", () => {
    const plan = planPush([line("SKU001", "DIST001", 5, "run-1"), line("SKU001", "DIST001", 5, "run-2")], new Map());
    expect(plan.groups.map((g) => g.runId)).toEqual(["run-1", "run-2"]);
  });
});
