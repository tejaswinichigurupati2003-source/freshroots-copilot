import type { Db } from "./client";

/** Arrays and plain objects go in as JSON text. Without this, pg would turn a JS array into a Postgres array. */
export function toParam(value: unknown): unknown {
  if (value === undefined) return null;
  if (value !== null && typeof value === "object" && !(value instanceof Date)) return JSON.stringify(value);
  return value;
}

const MAX_PARAMS = 60_000;

/**
 * Inserts rows with one statement per chunk. With `onConflict` it becomes an upsert: existing rows are updated
 * with the new values, and when every column is part of the key the duplicates are skipped.
 * Table and column names come from code, never from user input.
 */
export async function insertRows(db: Db, table: string, rows: Record<string, unknown>[], onConflict?: string): Promise<void> {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const rowsPerChunk = Math.max(1, Math.floor(MAX_PARAMS / columns.length));

  const keys = onConflict?.split(",").map((k) => k.trim()) ?? [];
  const updatable = columns.filter((c) => !keys.includes(c));
  const conflictClause = !onConflict
    ? ""
    : updatable.length === 0
      ? ` on conflict (${onConflict}) do nothing`
      : ` on conflict (${onConflict}) do update set ${updatable.map((c) => `${c} = excluded.${c}`).join(", ")}`;

  for (let start = 0; start < rows.length; start += rowsPerChunk) {
    const chunk = rows.slice(start, start + rowsPerChunk);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => `(${columns.map((c) => `$${params.push(toParam(row[c]))}`).join(", ")})`);
    await db.query(`insert into ${table} (${columns.join(", ")}) values ${tuples.join(", ")}${conflictClause}`, params);
  }
}

/** Postgres error code for a unique constraint violation. */
export const UNIQUE_VIOLATION = "23505";

export function errorCode(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code;
}
