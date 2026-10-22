import { describe, expect, it } from "vitest";
import { createGateway } from "./factory";
import { MockGateway } from "./mock-gateway";
import { ZohoGateway, type ZohoConfig } from "./zoho-gateway";
import { parseZohoMap } from "./zoho-map";

const config: ZohoConfig = { ZOHO_DC: "in", ZOHO_CLIENT_ID: "cid", ZOHO_CLIENT_SECRET: "secret", ZOHO_REFRESH_TOKEN: "refresh", ZOHO_ORG_ID: "999" };
const map = parseZohoMap("Kind,Local_ID,Zoho_ID\nvendor,DIST001,V1\nitem,SKU001,I1\nitem,SKU003,I3\n");

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function fakeZoho(routes: (url: URL, method: string) => unknown) {
  const calls: Call[] = [];
  const fetchFn = (async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? String(init.body) : undefined });
    const body = url.hostname.startsWith("accounts.") ? { access_token: "tok", expires_in: 3600 } : routes(url, init?.method ?? "GET");
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return { fetchFn, calls };
}

describe("ZohoGateway", () => {
  it("refreshes the token on the India accounts server and sends it as Zoho-oauthtoken", async () => {
    const { fetchFn, calls } = fakeZoho(() => ({ code: 0, message: "success", purchase_order: { purchaseorder_id: 1, purchaseorder_number: "PO-00007" } }));
    const gateway = new ZohoGateway(config, map, fetchFn);
    const result = await gateway.createDraftPurchaseOrder({ runId: "run-1", distributorId: "DIST001", lines: [{ recommendationId: "r", skuId: "SKU001", skuName: "Mango", quantity: 750 }] });

    expect(calls[0].url).toBe("https://accounts.zoho.in/oauth/v2/token");
    expect(calls[0].body).toContain("grant_type=refresh_token");
    expect(calls[1].url).toBe("https://www.zohoapis.in/inventory/v1/purchaseorders?organization_id=999");
    expect(calls[1].headers.Authorization).toBe("Zoho-oauthtoken tok");
    expect(JSON.parse(calls[1].body!)).toMatchObject({ vendor_id: "V1", line_items: [{ item_id: "I1", quantity: 750 }] });
    expect(result.externalId).toBe("PO-00007");
  });

  it("reuses the access token between calls", async () => {
    const { fetchFn, calls } = fakeZoho(() => ({ code: 0, message: "success", purchaseorders: [] }));
    const gateway = new ZohoGateway(config, map, fetchFn);
    await gateway.listOpenPurchaseOrders();
    await gateway.listOpenPurchaseOrders();
    expect(calls.filter((c) => c.url.includes("accounts.zoho.in"))).toHaveLength(1);
  });

  it("names the missing id when a SKU is not in zoho_map.csv", async () => {
    const { fetchFn } = fakeZoho(() => ({}));
    const gateway = new ZohoGateway(config, map, fetchFn);
    await expect(
      gateway.createDraftPurchaseOrder({ runId: "r", distributorId: "DIST001", lines: [{ recommendationId: "x", skuId: "SKU099", skuName: "?", quantity: 1 }] }),
    ).rejects.toThrow("No Zoho item id for SKU099");
  });

  it("surfaces Zoho's error message", async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ message: "Invalid value passed for vendor_id" }), { status: 400 })) as typeof fetch;
    const gateway = new ZohoGateway(config, map, async (input, init) =>
      String(input).includes("accounts.") ? new Response(JSON.stringify({ access_token: "t" })) : fetchFn(input, init),
    );
    await expect(
      gateway.createDraftPurchaseOrder({ runId: "r", distributorId: "DIST001", lines: [{ recommendationId: "x", skuId: "SKU001", skuName: "?", quantity: 1 }] }),
    ).rejects.toThrow("HTTP 400): Invalid value passed for vendor_id");
  });

  it("lists only open POs, reads their lines, and counts what is still to arrive", async () => {
    const { fetchFn } = fakeZoho((url) => {
      if (url.pathname.endsWith("/purchaseorders")) {
        return {
          code: 0,
          message: "success",
          purchaseorders: [
            { purchaseorder_id: 11, purchaseorder_number: "PO-11", status: "open", date: "2026-10-14", delivery_date: "2026-10-26" },
            { purchaseorder_id: 12, purchaseorder_number: "PO-12", status: "draft", date: "2026-10-15" },
            { purchaseorder_id: 13, purchaseorder_number: "PO-13", status: "billed", date: "2026-09-01" },
          ],
          page_context: { has_more_page: false },
        };
      }
      return { code: 0, message: "success", purchaseorder: { line_items: [{ item_id: "I3", quantity: 400, quantity_received: 100 }, { item_id: "OTHER", quantity: 5 }] } };
    });
    const lines = await new ZohoGateway(config, map, fetchFn).listOpenPurchaseOrders();

    expect(lines).toEqual([{ po_id: "PO-11:SKU003", sku_id: "SKU003", qty_units: 300, order_date: "2026-10-14", expected_arrival: "2026-10-26", status: "open" }]);
  });
});

describe("createGateway", () => {
  it("defaults to mock", () => {
    expect(createGateway({})).toBeInstanceOf(MockGateway);
    expect(createGateway({ ZOHO_MODE: "mock" })).toBeInstanceOf(MockGateway);
  });

  it("lists the missing variables in live mode", () => {
    expect(() => createGateway({ ZOHO_MODE: "live" })).toThrow(/ZOHO_CLIENT_ID.*ZOHO_ORG_ID/);
  });
});

describe("parseZohoMap", () => {
  it("separates items from vendors and rejects unknown kinds", () => {
    expect(map.items.get("SKU001")).toBe("I1");
    expect(map.vendors.get("DIST001")).toBe("V1");
    expect(() => parseZohoMap("Kind,Local_ID,Zoho_ID\nwarehouse,W1,Z1\n")).toThrow("row 2");
  });
});
