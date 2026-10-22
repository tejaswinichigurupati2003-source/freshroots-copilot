import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { getPool } from "../src/lib/db/client";

const migrationsDir = path.resolve(__dirname, "../db/migrations");

/** Applies db/migrations/*.sql in order. Each file runs once, in its own transaction, and is recorded in schema_migrations. */
async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const pool = getPool();

  await pool.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const applied = new Set((await pool.query("select name from schema_migrations")).rows.map((r) => r.name as string));

  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) {
      console.log(`skip   ${file} (already applied)`);
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(readFileSync(path.join(migrationsDir, file), "utf8"));
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`apply  ${file}`);
    } catch (err) {
      await client.query("rollback");
      throw new Error(`${file} failed and was rolled back: ${err instanceof Error ? err.message : err}`);
    } finally {
      client.release();
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
