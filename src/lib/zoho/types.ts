export interface DraftPoLine {
  recommendationId: string;
  skuId: string;
  skuName: string;
  quantity: number;
}

export interface DraftPo {
  runId: string;
  distributorId: string;
  lines: DraftPoLine[];
}

export interface DraftPoResult {
  externalId: string;
  response: Record<string, unknown>;
}

/** An open purchase order line, shaped like a row of the open_pos table. */
export interface OpenPoLine {
  po_id: string;
  sku_id: string;
  qty_units: number;
  order_date: string;
  expected_arrival: string;
  status: string;
}

export interface PurchaseOrderGateway {
  mode: "mock" | "live";
  createDraftPurchaseOrder(po: DraftPo): Promise<DraftPoResult>;
  /** Open POs from the purchasing system. In mock mode they come from open_pos_seed.csv instead, so this returns nothing. */
  listOpenPurchaseOrders(): Promise<OpenPoLine[]>;
}
