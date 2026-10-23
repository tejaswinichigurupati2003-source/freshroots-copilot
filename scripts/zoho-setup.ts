import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadSeedRows, seedTables } from "../src/lib/ingest/seed-files";

/**
 * One-time setup for live Zoho Inventory. Creates the organization if the account has none, then one vendor per
 * distributor and one item per SKU (skipping any that already exist), and writes data/zoho_map.csv.
 * Needs a refresh token with these scopes: ZohoInventory.settings.CREATE, settings.READ, contacts.CREATE, contacts.READ,
 * items.CREATE, items.READ. Safe to run again.
 *
 * Docs: https://www.zoho.com/inventory/api/v1/organizations/ , /contacts/ , /items/ (create endpoints).
 */

const ENV_FILE = ".env.local";
const MAP_FILE = "data/zoho_map.csv";

function setEnvLine(name: string, value: string) {
  const lines = readFileSync(ENV_FILE, "utf8").split("\n");
  const index = lines.findIndex((l) => l.startsWith(`${name}=`));
  if (index === -1) lines.push(`${name}=${value}`);
  else lines[index] = `${name}=${value}`;
  writeFileSync(ENV_FILE, lines.join("\n"));
}

type Json = Record<string, any>;

async function main() {
  if (!existsSync(ENV_FILE)) throw new Error(`${ENV_FILE} not found. Run this from the project folder.`);
  process.loadEnvFile(ENV_FILE);
  const dc = process.env.ZOHO_DC?.trim() || "in";
  const api = `https://www.zohoapis.${dc}/inventory/v1`;

  const tokenResponse = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: process.env.ZOHO_REFRESH_TOKEN ?? "",
      client_id: process.env.ZOHO_CLIENT_ID ?? "",
      client_secret: process.env.ZOHO_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  const token = (await tokenResponse.json()) as Json;
  if (!token.access_token) throw new Error(`Token refresh failed (${token.error ?? tokenResponse.status}). Run npm run zoho:token first.`);
  const headers = { Authorization: `Zoho-oauthtoken ${token.access_token}`, "Content-Type": "application/json" };

  let orgId = process.env.ZOHO_ORG_ID?.trim() ?? "";

  async function call(method: "GET" | "POST", route: string, body?: Json, withOrg = true): Promise<Json> {
    const url = new URL(`${api}${route}`);
    if (withOrg) url.searchParams.set("organization_id", orgId);
    const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json = (await response.json().catch(() => ({}))) as Json;
    if (!response.ok || (json.code !== undefined && json.code !== 0)) {
      throw new Error(`Zoho ${method} ${route} failed (HTTP ${response.status}, code ${json.code}): ${json.message ?? "no message"}`);
    }
    return json;
  }

  // 1. Organization
  if (!orgId) {
    const existing = (await call("GET", "/organizations", undefined, false)).organizations as Json[] | undefined;
    if (existing && existing.length > 0) {
      orgId = String(existing[0].organization_id);
      console.log(`Using existing organization "${existing[0].name}"`);
    } else {
      const portal = `freshroots${Math.floor(100000 + Math.random() * 900000)}`;
      const created = await call(
        "POST",
        "/organizations",
        { name: "Freshroots", currency_code: "INR", time_zone: "Asia/Calcutta", portal_name: portal, language_code: "en", industry_type: "Consumer Packaged Goods", fiscal_year_start_month: "april", address: { street_address1: "Pune Central Warehouse", city: "Pune", state: "Maharashtra", country: "India", zip: "411001" } },
        false,
      );
      orgId = String(created.organization.organization_id);
      console.log("Created organization Freshroots");
    }
    setEnvLine("ZOHO_ORG_ID", orgId);
    console.log("Saved ZOHO_ORG_ID to .env.local");
  }

  const seedDir = path.resolve(__dirname, "../data/seed");
  const rows = <T>(name: string) => loadSeedRows(seedTables.find((t) => t.table === name)!, seedDir) as unknown as T[];
  const distributors = rows<{ distributor_id: string; distributor_name: string }>("distributors");
  const skus = rows<{ sku_id: string; sku_name: string }>("skus");
  const economics = rows<{ sku_id: string; unit_cost_inr: number; selling_price_inr: number }>("sku_economics");

  // 2. Vendors, one per distributor
  const vendorsByName = new Map<string, string>(
    ((await call("GET", "/contacts?contact_type=vendor&per_page=200")).contacts as Json[]).map((c) => [String(c.contact_name), String(c.contact_id)]),
  );
  const vendorIds = new Map<string, string>();
  for (const d of distributors) {
    let id = vendorsByName.get(d.distributor_name);
    if (!id) {
      id = String((await call("POST", "/contacts", { contact_name: d.distributor_name, contact_type: "vendor" })).contact.contact_id);
      console.log(`Created vendor ${d.distributor_name}`);
    }
    vendorIds.set(d.distributor_id, id);
  }

  // 3. Items, one per SKU, matched on SKU code
  const itemsBySku = new Map<string, string>(
    ((await call("GET", "/items?per_page=200")).items as Json[]).filter((i) => i.sku).map((i) => [String(i.sku), String(i.item_id)]),
  );
  const itemIds = new Map<string, string>();
  for (const sku of skus) {
    let id = itemsBySku.get(sku.sku_id);
    if (!id) {
      const econ = economics.find((e) => e.sku_id === sku.sku_id);
      const body = { name: sku.sku_name, sku: sku.sku_id, rate: econ?.selling_price_inr, purchase_rate: econ?.unit_cost_inr, product_type: "goods" };
      let created: Json;
      try {
        created = await call("POST", "/items", { ...body, item_type: "inventory" });
      } catch {
        created = await call("POST", "/items", { ...body, item_type: "sales_and_purchases" });
      }
      id = String(created.item.item_id);
      console.log(`Created item ${sku.sku_id}`);
    }
    itemIds.set(sku.sku_id, id);
  }

  // 4. Id map used by the live gateway
  const lines = ["Kind,Local_ID,Zoho_ID", ...[...vendorIds].map(([k, v]) => `vendor,${k},${v}`), ...[...itemIds].map(([k, v]) => `item,${k},${v}`)];
  writeFileSync(MAP_FILE, lines.join("\n") + "\n");
  console.log(`Wrote ${MAP_FILE}: ${vendorIds.size} vendors, ${itemIds.size} items`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
