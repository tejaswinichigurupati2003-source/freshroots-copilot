import { describe, expect, it } from "vitest";
import type { AuditEntry } from "../ingest/pipeline";
import { AlreadyDecidedError, decide, type DecisionRecord, type DecisionStore, type RecommendationForDecision } from "./decide";
import { needsReview, sortForReview } from "./review";

const rec = (patch: Partial<RecommendationForDecision> = {}): RecommendationForDecision => ({
  id: "rec-1",
  sku_id: "SKU001",
  flag: "STOCKOUT_RISK",
  recommended_qty: 750,
  status: "pending",
  edge_case_type: null,
  signals: {},
  ...patch,
});

function memoryStore(recommendation: RecommendationForDecision | null, raceLost = false) {
  const saved: { decision: DecisionRecord; status: string }[] = [];
  const audit: AuditEntry[] = [];
  const store: DecisionStore = {
    getRecommendation: async () => recommendation,
    saveDecision: async (decision, status) => {
      if (raceLost) throw new AlreadyDecidedError();
      saved.push({ decision, status });
    },
    audit: async (entry) => {
      audit.push(entry);
    },
  };
  return { store, saved, audit };
}

const input = { recommendationId: "rec-1", actor: "Raghav" as const };

describe("decide", () => {
  it("approves at the recommended quantity and audits who decided", async () => {
    const { store, saved, audit } = memoryStore(rec());
    const result = await decide(store, { ...input, action: "approve" });

    expect(result).toEqual({ ok: true, message: "Approved: SKU001, quantity 750." });
    expect(saved[0]).toMatchObject({ status: "approved", decision: { action: "approved", original_qty: 750, final_qty: 750, decided_by: "Raghav" } });
    expect(audit).toEqual([expect.objectContaining({ actor: "Raghav", action: "decision_approved", entity_id: "rec-1" })]);
  });

  it("records an edited quantity with the original kept", async () => {
    const { store, saved } = memoryStore(rec());
    await decide(store, { ...input, action: "edit", quantity: "600" });
    expect(saved[0].decision).toMatchObject({ action: "edited", original_qty: 750, final_qty: 600, decided_by: "Raghav" });
  });

  it("treats an edit to the same quantity as an approval", async () => {
    const { store, saved } = memoryStore(rec());
    await decide(store, { ...input, action: "edit", quantity: "750" });
    expect(saved[0].decision.action).toBe("approved");
  });

  it("accepts 0 as an edited quantity", async () => {
    const { store, saved } = memoryStore(rec());
    await decide(store, { ...input, action: "edit", quantity: "0" });
    expect(saved[0].decision).toMatchObject({ action: "edited", final_qty: 0 });
  });

  it.each(["", "-5", "12.5", "abc"])("rejects the edit quantity %j", async (quantity) => {
    const { store, saved } = memoryStore(rec());
    const result = await decide(store, { ...input, action: "edit", quantity });
    expect(result).toEqual({ ok: false, error: "Enter a whole number of 0 or more." });
    expect(saved).toHaveLength(0);
  });

  it("rejects with a reason, saves final quantity 0, and keeps the reason", async () => {
    const { store, saved } = memoryStore(rec());
    await decide(store, { ...input, action: "reject", reason: "Festival stock already booked" });
    expect(saved[0]).toMatchObject({ status: "rejected", decision: { action: "rejected", final_qty: 0, reason: "Festival stock already booked" } });
  });

  it.each([undefined, "", "   ", "no"])("refuses to reject with reason %j", async (reason) => {
    const { store, saved, audit } = memoryStore(rec());
    const result = await decide(store, { ...input, action: "reject", reason });
    expect(result).toEqual({ ok: false, error: "Add a reason of at least 5 characters to reject." });
    expect(saved).toHaveLength(0);
    expect(audit).toHaveLength(0);
  });

  it("blocks a second decision on the same line", async () => {
    const { store } = memoryStore(rec({ status: "approved" }));
    expect(await decide(store, { ...input, action: "approve" })).toEqual({ ok: false, error: "This line has already been decided." });
  });

  it("reports a lost race as already decided", async () => {
    const { store } = memoryStore(rec(), true);
    expect(await decide(store, { ...input, action: "approve" })).toEqual({ ok: false, error: "This line has already been decided." });
  });

  it("blocks decisions on plain OK rows but allows OK rows with an edge case", async () => {
    const plain = memoryStore(rec({ flag: "OK", recommended_qty: 0 }));
    expect(await decide(plain.store, { ...input, action: "approve" })).toEqual({ ok: false, error: "Rows flagged OK need no approval." });

    const edge = memoryStore(rec({ flag: "OK", recommended_qty: 0, signals: { recentDrop: true } }));
    expect((await decide(edge.store, { ...input, action: "approve" })).ok).toBe(true);
  });

  it("refuses decisions from Deepa, who has an oversight role", async () => {
    const { store, saved, audit } = memoryStore(rec());
    const result = await decide(store, { ...input, actor: "Deepa", action: "approve" });
    expect(result).toEqual({ ok: false, error: "Only Raghav can approve, edit or reject lines. You are acting as Deepa." });
    expect(saved).toHaveLength(0);
    expect(audit).toHaveLength(0);
  });

  it("requires a known actor", async () => {
    const { store } = memoryStore(rec());
    const result = await decide(store, { recommendationId: "rec-1", actor: "Someone" as "Raghav", action: "approve" });
    expect(result).toEqual({ ok: false, error: "Choose who you are acting as." });
  });

  it("reports a missing recommendation", async () => {
    const { store } = memoryStore(null);
    expect((await decide(store, { ...input, action: "approve" })).ok).toBe(false);
  });
});

describe("sortForReview", () => {
  const row = (sku_id: string, flag: string, signals: Record<string, unknown> = {}) => ({ sku_id, flag, edge_case_type: null, signals });

  it("puts edge cases first, then stockout, overstock, high demand, OK", () => {
    const sorted = sortForReview([
      row("SKU005", "OK"),
      row("SKU003", "HIGH_DEMAND"),
      row("SKU006", "OVERSTOCK_RISK"),
      row("SKU018", "STOCKOUT_RISK", { oneWeekSpike: true }),
      row("SKU001", "STOCKOUT_RISK"),
      row("SKU017", "OK", { recentDrop: true }),
      row("SKU016", "INSUFFICIENT_HISTORY", { shortHistory: true }),
    ]).map((r) => r.sku_id);
    expect(sorted).toEqual(["SKU016", "SKU017", "SKU018", "SKU001", "SKU006", "SKU003", "SKU005"]);
  });

  it("flags only non-OK or edge-case rows for review", () => {
    expect(needsReview(row("SKU005", "OK"))).toBe(false);
    expect(needsReview(row("SKU005", "OK", { recentDrop: true }))).toBe(true);
  });
});
