import type { DraftPo, DraftPoResult, OpenPoLine, PurchaseOrderGateway } from "./types";

/**
 * Default gateway. Nothing leaves the machine: the push service saves the draft to the zoho_drafts table,
 * and this gateway only supplies a made-up PO number so the demo looks the same as live mode.
 */
export class MockGateway implements PurchaseOrderGateway {
  readonly mode = "mock" as const;

  async createDraftPurchaseOrder(po: DraftPo): Promise<DraftPoResult> {
    const externalId = `MOCK-PO-${po.distributorId}-${Date.now().toString(36).toUpperCase()}`;
    return { externalId, response: { mock: true, lines: po.lines.length } };
  }

  async listOpenPurchaseOrders(): Promise<OpenPoLine[]> {
    return [];
  }
}
