import { describe, expect, it } from "vitest";
import { decisionText, finalQtyText, orderText } from "./labels";

describe("orderText", () => {
  it("shows the quantity when there is something to order", () => {
    expect(orderText("STOCKOUT_RISK", 750)).toBe("750");
    expect(orderText("HIGH_DEMAND", 300)).toBe("300");
  });

  it("says Pause order for overstock and No order for OK", () => {
    expect(orderText("OVERSTOCK_RISK", 0)).toBe("Pause order");
    expect(orderText("OK", 0)).toBe("No order");
  });

  it("asks Raghav to size a SKU with too little history, never showing 0", () => {
    expect(orderText("INSUFFICIENT_HISTORY", 0)).toBe("You size this");
  });
});

describe("decision wording", () => {
  it("never prints 0 units", () => {
    expect(finalQtyText(0)).toBe("No order");
    expect(finalQtyText(400)).toBe("400 units");
  });

  it("describes each call in one line", () => {
    expect(decisionText("approved", 750)).toBe("Approved: 750 units");
    expect(decisionText("approved", 0)).toBe("Approved: no order");
    expect(decisionText("edited", 400)).toBe("Approved (quantity changed): 400 units");
    expect(decisionText("rejected", 0)).toBe("Rejected");
  });
});
