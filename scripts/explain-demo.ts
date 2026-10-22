import { parse } from "csv-parse/sync";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildRecommendations } from "../src/lib/ingest/pipeline";
import { loadSeedRows, seedTables } from "../src/lib/ingest/seed-files";
import type { PipelineData } from "../src/lib/ingest/types";
import { explainAll } from "../src/lib/llm/explain";
import { createGeminiClient } from "../src/lib/llm/gemini-client";

/** Runs the explanation layer on the seed CSVs. No database needed. Uses Gemini when a key is set, templates otherwise. */
async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const seedDir = path.resolve(__dirname, "../data/seed");
  const rows = <T>(name: string) => loadSeedRows(seedTables.find((t) => t.table === name)!, seedDir) as unknown as T[];
  const data: PipelineData = {
    skus: rows("skus"),
    sales: rows("sales_weekly"),
    stock: rows("stock_snapshots"),
    calendar: rows("calendar"),
    openPos: rows("open_pos"),
  };

  const recs = buildRecommendations("2026-10-19", data);
  const before = JSON.stringify(recs.map((r) => [r.sku_id, r.flag, r.recommended_qty]));

  const client = createGeminiClient();
  console.log(client ? `Using Gemini (${process.env.GEMINI_MODEL})` : "No GEMINI_API_KEY or GEMINI_MODEL set: using template explanations");
  const audit: unknown[] = [];
  const explanations = await explainAll(
    recs.map((rec) => ({ rec, sku: data.skus.find((s) => s.sku_id === rec.sku_id)! })),
    { client, audit: async (entry) => void audit.push(entry) },
  );

  for (const id of ["SKU016", "SKU017", "SKU018"]) {
    const rec = recs.find((r) => r.sku_id === id)!;
    const e = explanations.get(id)!;
    console.log(`\n${id}  ${rec.flag}  qty ${rec.recommended_qty}  [${e.explanation_source}]\n  type: ${e.edge_case_type}\n  reason: ${e.reason}\n  evidence: ${e.evidence || "(none)"}`);
  }

  const after = JSON.stringify(recs.map((r) => [r.sku_id, r.flag, r.recommended_qty]));
  const expected = parse(readFileSync(path.resolve(__dirname, "../data/expected/expected_results.csv"), "utf8"), { columns: true }) as {
    SKU_ID: string;
    Expected_Flag: string;
    Expected_Order_Qty: string;
  }[];
  const matchesKey = recs.every((r) => {
    const e = expected.find((x) => x.SKU_ID === r.sku_id)!;
    return e.Expected_Flag === r.flag && Number(e.Expected_Order_Qty) === r.recommended_qty;
  });
  console.log(`\nQuantities unchanged by the LLM layer: ${before === after}. Still equal to expected_results.csv: ${matchesKey}.`);
  console.log(`Audit events from the layer: ${audit.length}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
