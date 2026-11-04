import { MockGateway } from "./mock-gateway";
import type { PurchaseOrderGateway } from "./types";
import { loadZohoMap, parseZohoMap } from "./zoho-map";
import { ZohoGateway, zohoConfigSchema } from "./zoho-gateway";

/** ZOHO_MODE picks the gateway. Anything other than "live" gives the mock, so a demo never depends on Zoho. */
export function createGateway(env: Record<string, string | undefined> = process.env): PurchaseOrderGateway {
  if (env.ZOHO_MODE?.trim().toLowerCase() !== "live") return new MockGateway();

  const config = zohoConfigSchema.safeParse(env);
  if (!config.success) {
    const missing = config.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`ZOHO_MODE=live needs these variables in .env.local: ${missing}.`);
  }
  // On a host with no project files (Vercel), the map comes from ZOHO_MAP_CSV. Locally it is data/zoho_map.csv.
  const inline = env.ZOHO_MAP_CSV?.trim();
  const map = inline ? parseZohoMap(inline) : loadZohoMap(env.ZOHO_MAP_PATH?.trim() || "data/zoho_map.csv");
  return new ZohoGateway(config.data, map);
}
