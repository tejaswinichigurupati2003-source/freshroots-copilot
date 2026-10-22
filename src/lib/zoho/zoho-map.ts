import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import { z } from "zod";

const rowSchema = z.object({ Kind: z.enum(["item", "vendor"]), Local_ID: z.string().min(1), Zoho_ID: z.string().min(1) });

export interface ZohoMap {
  /** SKU_ID to Zoho item id. */
  items: Map<string, string>;
  /** Distributor_ID to Zoho vendor id. */
  vendors: Map<string, string>;
}

/** Format: Kind,Local_ID,Zoho_ID with Kind = item (SKU_ID) or vendor (Distributor_ID). See data/zoho_map.example.csv. */
export function parseZohoMap(csv: string): ZohoMap {
  const map: ZohoMap = { items: new Map(), vendors: new Map() };
  const records: unknown[] = parse(csv, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  records.forEach((record, i) => {
    const row = rowSchema.safeParse(record);
    if (!row.success) throw new Error(`zoho_map.csv row ${i + 2}: ${row.error.message}`);
    (row.data.Kind === "item" ? map.items : map.vendors).set(row.data.Local_ID, row.data.Zoho_ID);
  });
  return map;
}

export function loadZohoMap(filePath: string): ZohoMap {
  try {
    return parseZohoMap(readFileSync(filePath, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`ZOHO_MODE=live needs ${filePath}. Copy data/zoho_map.example.csv and fill in your Zoho item and vendor ids.`);
    }
    throw err;
  }
}
