import path from "node:path";
import { existsSync } from "node:fs";
import { getDb, getPool } from "../src/lib/db/client";
import { insertRows } from "../src/lib/db/sql";
import { loadSeedRows, seedTables } from "../src/lib/ingest/seed-files";

const seedDir = path.resolve(__dirname, "../data/seed");

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const dryRun = process.argv.includes("--dry");
  const db = dryRun ? undefined : getDb();

  // seedTables is ordered so parent tables load before the tables that reference them.
  for (const entry of seedTables) {
    const rows = loadSeedRows(entry, seedDir);
    if (!db) {
      console.log(`[dry] ${entry.table}: ${rows.length} rows valid`);
      continue;
    }
    await insertRows(db, entry.table, rows, entry.conflict);
    console.log(`${entry.table}: ${rows.length} rows upserted`);
  }
  if (db) {
    await insertRows(db, "audit_log", [{ actor: "system", action: "seed_loaded", details: { tables: seedTables.length } }]);
    await getPool().end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
