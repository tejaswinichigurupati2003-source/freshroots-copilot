import type { PurchaseOrderGateway, OpenPoLine } from "./types";

export interface OpenPoStore {
  /** Makes the open_pos table match `lines` exactly. */
  replaceOpenPos(lines: OpenPoLine[]): Promise<void>;
}

/** Live mode only: copies Zoho's open POs into open_pos before a run. In mock mode the seed file stays in place. */
export async function syncOpenPos(gateway: PurchaseOrderGateway, store: OpenPoStore): Promise<number> {
  if (gateway.mode !== "live") return 0;
  const lines = await gateway.listOpenPurchaseOrders();
  await store.replaceOpenPos(lines);
  return lines.length;
}
