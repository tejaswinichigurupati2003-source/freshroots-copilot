import { parse } from "csv-parse/sync";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const { runNow } = await import("../src/lib/ingest/run-now");

  const result = await runNow("cli");
  if (result.status !== "completed") {
    console.log(`Run ${result.status}${"reason" in result ? ` (${result.reason})` : ""}: ${result.message}`);
    process.exit(result.status === "failed" ? 1 : 0);
  }

  const expected = parse(readFileSync(path.resolve(__dirname, "../data/expected/expected_results.csv"), "utf8"), {
    columns: true,
    skip_empty_lines: true,
  }) as { SKU_ID: string; Expected_Flag: string; Expected_Order_Qty: string }[];

  let mismatches = 0;
  console.log("SKU      FLAG                   QTY   MATCH");
  for (const rec of result.recommendations) {
    const e = expected.find((x) => x.SKU_ID === rec.sku_id);
    const ok = e?.Expected_Flag === rec.flag && Number(e.Expected_Order_Qty) === rec.recommended_qty;
    if (!ok) mismatches++;
    console.log(`${rec.sku_id}   ${rec.flag.padEnd(20)} ${String(rec.recommended_qty).padStart(5)}   ${ok ? "yes" : "NO"}`);
  }
  console.log(`\nRun ${result.runId}: ${result.recommendations.length} SKUs, ${mismatches} mismatches against expected_results.csv`);
  process.exit(mismatches === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
