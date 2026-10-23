/**
 * Plain-English wording for order quantities. A bare 0 reads like a number to order, but the system is saying
 * "do not order" (or, with too little history, "you decide"), so show words instead.
 */

/** What the system recommends ordering. */
export function orderText(flag: string, qty: number): string {
  if (flag === "INSUFFICIENT_HISTORY") return "You size this";
  if (qty > 0) return String(qty);
  return flag === "OVERSTOCK_RISK" ? "Pause order" : "No order";
}

/** The quantity Raghav settled on. Zero is "No order", which is a real answer for an approval. */
export function finalQtyText(qty: number): string {
  return qty > 0 ? `${qty} units` : "No order";
}

const DECISION_LABEL: Record<string, string> = { approved: "Approved", edited: "Approved (quantity changed)", rejected: "Rejected" };

/** One line for a decided row, for example "Approved: 750 units" or "Rejected". A rejection has no quantity. */
export function decisionText(action: string, finalQty: number): string {
  const label = DECISION_LABEL[action] ?? action;
  return action === "rejected" ? label : `${label}: ${finalQtyText(finalQty).toLowerCase()}`;
}
