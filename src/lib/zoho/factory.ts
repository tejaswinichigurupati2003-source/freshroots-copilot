import { MockGateway } from "./mock-gateway";
import type { PurchaseOrderGateway } from "./types";
import { loadZohoMap } from "./zoho-map";
import { ZohoGateway, zohoConfigSchema } from "./zoho-gateway";

/** ZOHO_MODE picks the gateway. Anything other than "live" gives the mock, so a demo never depends on Zoho. */
export function createGateway(env: Record<string, string | undefined> = process.env): PurchaseOrderGateway {
  if (env.ZOHO_MODE?.trim().toLowerCase() !== "live") return new MockGateway();

  const config = zohoConfigSchema.safeParse(env);
  if (!config.success) {
    const missing = config.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`ZOHO_MODE=live needs these variables in .env.local: ${missing}.`);
  }
  return new ZohoGateway(config.data, loadZohoMap(env.ZOHO_MAP_PATH?.trim() || "data/zoho_map.csv"));
}
