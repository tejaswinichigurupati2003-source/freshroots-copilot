/**
 * Live Zoho Inventory gateway (REST API v1, OAuth refresh-token flow with a Self Client).
 *
 * Pages used:
 * - Introduction, data-centre base URLs, organization_id, rate limits:
 *   https://www.zoho.com/inventory/api/v1/introduction/
 * - OAuth (Authorization: Zoho-oauthtoken header, refresh token request, scope names):
 *   https://www.zoho.com/inventory/api/v1/oauth/
 * - Purchase orders (create, list, retrieve; scopes ZohoInventory.purchaseorders.CREATE and .READ):
 *   https://www.zoho.com/inventory/api/v1/purchaseorders/
 *
 * Assumptions to confirm against your own account (the pages above did not settle them):
 * - A new PO is created as a draft. The docs list purchaseorder_number as required, but we omit it
 *   and rely on Zoho's auto-numbering. If your org has auto-numbering off, creation will fail with a clear Zoho error.
 * - The list endpoint's status filter is not documented in the pages above, so we list every PO and filter here.
 * - Free plan: the introduction page lists a 1000 requests/day limit and 5 concurrent calls, but whether API access
 *   is switched on for the free plan is unconfirmed. Check Settings > Developer Space in your account.
 */
import { z } from "zod";
import type { ZohoMap } from "./zoho-map";
import type { DraftPo, DraftPoResult, OpenPoLine, PurchaseOrderGateway } from "./types";

const DATA_CENTRES = ["com", "eu", "in", "com.au", "jp", "ca", "sa", "com.cn"] as const;

export const zohoConfigSchema = z.object({
  ZOHO_DC: z.enum(DATA_CENTRES).default("in"),
  ZOHO_CLIENT_ID: z.string().min(1),
  ZOHO_CLIENT_SECRET: z.string().min(1),
  ZOHO_REFRESH_TOKEN: z.string().min(1),
  ZOHO_ORG_ID: z.string().min(1),
});

export type ZohoConfig = z.infer<typeof zohoConfigSchema>;

/** Statuses that count as stock on the way. Drafts are ours and not yet sent, so they do not count. */
const OPEN_STATUSES = new Set(["open", "issued", "partially_received"]);

const PAGE_SIZE = 200;

const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number().optional() });
const createdOrder = z.object({ purchaseorder_id: z.union([z.string(), z.number()]), purchaseorder_number: z.string() });
// The docs example calls the object purchase_order; the live API returns purchaseorder. Accept both.
const createSchema = z.object({
  code: z.number(),
  message: z.string(),
  purchaseorder: createdOrder.optional(),
  purchase_order: createdOrder.optional(),
});
const listSchema = z.object({
  code: z.number(),
  message: z.string(),
  purchaseorders: z
    .array(
      z.object({
        purchaseorder_id: z.union([z.string(), z.number()]),
        purchaseorder_number: z.string(),
        status: z.string(),
        date: z.string().optional(),
        delivery_date: z.string().optional(),
      }),
    )
    .default([]),
  page_context: z.object({ has_more_page: z.boolean().optional() }).optional(),
});
const detailSchema = z.object({
  code: z.number(),
  message: z.string(),
  purchaseorder: z.object({
    line_items: z.array(z.object({ item_id: z.union([z.string(), z.number()]), quantity: z.number(), quantity_received: z.number().optional() })).default([]),
  }),
});

export class ZohoGateway implements PurchaseOrderGateway {
  readonly mode = "live" as const;
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: ZohoConfig,
    private readonly map: ZohoMap,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private get apiBase() {
    return `https://www.zohoapis.${this.config.ZOHO_DC}/inventory/v1`;
  }

  private async token(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > this.now() + 60_000) return this.accessToken.value;

    const response = await this.fetchFn(`https://accounts.zoho.${this.config.ZOHO_DC}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: this.config.ZOHO_REFRESH_TOKEN,
        client_id: this.config.ZOHO_CLIENT_ID,
        client_secret: this.config.ZOHO_CLIENT_SECRET,
        grant_type: "refresh_token",
      }),
    });
    const parsed = tokenSchema.safeParse(await response.json());
    if (!response.ok || !parsed.success) throw new Error(`Zoho token refresh failed (HTTP ${response.status}). Check the refresh token and ZOHO_DC.`);

    this.accessToken = { value: parsed.data.access_token, expiresAt: this.now() + (parsed.data.expires_in ?? 3600) * 1000 };
    return this.accessToken.value;
  }

  private async call(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    const url = new URL(`${this.apiBase}${path}`);
    url.searchParams.set("organization_id", this.config.ZOHO_ORG_ID);
    const response = await this.fetchFn(url, {
      method,
      headers: { Authorization: `Zoho-oauthtoken ${await this.token()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = (json as { message?: string }).message ?? "no message";
      throw new Error(`Zoho ${method} ${path} failed (HTTP ${response.status}): ${message}`);
    }
    return json;
  }

  async createDraftPurchaseOrder(po: DraftPo): Promise<DraftPoResult> {
    const vendorId = this.map.vendors.get(po.distributorId);
    if (!vendorId) throw new Error(`No Zoho vendor id for ${po.distributorId} in zoho_map.csv.`);
    const lineItems = po.lines.map((line) => {
      const itemId = this.map.items.get(line.skuId);
      if (!itemId) throw new Error(`No Zoho item id for ${line.skuId} in zoho_map.csv.`);
      return { item_id: itemId, quantity: line.quantity };
    });

    const json = await this.call("POST", "/purchaseorders", {
      vendor_id: vendorId,
      line_items: lineItems,
      notes: `Draft created by the Freshroots Demand Planning Copilot after approval. Run ${po.runId}.`,
    });
    const parsed = createSchema.parse(json);
    const order = parsed.purchaseorder ?? parsed.purchase_order;
    if (parsed.code !== 0 || !order) throw new Error(`Zoho refused the purchase order: ${parsed.message}`);

    return { externalId: order.purchaseorder_number, response: parsed as unknown as Record<string, unknown> };
  }

  async listOpenPurchaseOrders(): Promise<OpenPoLine[]> {
    const skuByItem = new Map([...this.map.items].map(([sku, item]) => [item, sku]));
    const lines: OpenPoLine[] = [];

    for (let page = 1; ; page++) {
      const list = listSchema.parse(await this.call("GET", `/purchaseorders?page=${page}&per_page=${PAGE_SIZE}`));
      for (const po of list.purchaseorders.filter((p) => OPEN_STATUSES.has(p.status.toLowerCase()))) {
        const detail = detailSchema.parse(await this.call("GET", `/purchaseorders/${po.purchaseorder_id}`));
        for (const item of detail.purchaseorder.line_items) {
          const sku = skuByItem.get(String(item.item_id));
          const outstanding = item.quantity - (item.quantity_received ?? 0);
          if (!sku || outstanding <= 0) continue;
          lines.push({
            po_id: `${po.purchaseorder_number}:${sku}`,
            sku_id: sku,
            qty_units: outstanding,
            order_date: po.date ?? "",
            expected_arrival: po.delivery_date ?? po.date ?? "",
            status: po.status,
          });
        }
      }
      if (!list.page_context?.has_more_page) return lines;
    }
  }
}
