import { describe, expect, it } from "vitest";
import { carryOver, type PastLine } from "./carry-over";

const past = (flag: string, decision: PastLine["decision"] = null): PastLine => ({ flag, decision });
const rejected = { action: "rejected", final_qty: 0, reason: "Supplier on strike", decided_by: "Raghav", decided_at: "2026-10-26T04:00:00Z" };

describe("carryOver", () => {
  it("counts consecutive runs with the same flag, this one included", () => {
    expect(carryOver({ flag: "STOCKOUT_RISK", past: [past("STOCKOUT_RISK"), past("STOCKOUT_RISK"), past("OK"), past("STOCKOUT_RISK")], drafts: [], openPoIds: [] }).streak).toBe(3);
  });

  it("is 1 for a first-time flag, and for OK rows", () => {
    expect(carryOver({ flag: "STOCKOUT_RISK", past: [past("OK")], drafts: [], openPoIds: [] }).streak).toBe(1);
    expect(carryOver({ flag: "OK", past: [past("OK"), past("OK")], drafts: [], openPoIds: [] }).streak).toBe(1);
  });

  it("returns the most recent decision, skipping runs with none", () => {
    const result = carryOver({ flag: "STOCKOUT_RISK", past: [past("STOCKOUT_RISK"), past("STOCKOUT_RISK", rejected)], drafts: [], openPoIds: [] });
    expect(result.lastDecision).toEqual(rejected);
  });

  it("lists drafts whose PO is not in the open PO list", () => {
    const drafts = [
      { externalId: "PO-00001", quantity: 500, createdAt: "2026-10-26T05:00:00Z" },
      { externalId: "PO-00002", quantity: 300, createdAt: "2026-10-29T05:00:00Z" },
    ];
    const result = carryOver({ flag: "STOCKOUT_RISK", past: [], drafts, openPoIds: ["PO-00002:SKU001"] });
    expect(result.draftsNotCounted.map((d) => d.externalId)).toEqual(["PO-00001"]);
  });

  it("does not mistake PO-0001 for PO-00010", () => {
    const drafts = [{ externalId: "PO-0001", quantity: 5, createdAt: "2026-10-26T05:00:00Z" }];
    expect(carryOver({ flag: "OK", past: [], drafts, openPoIds: ["PO-00010:SKU001"] }).draftsNotCounted).toHaveLength(1);
  });
});
