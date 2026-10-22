import { Pool, types } from "pg";
import { z } from "zod";

// Hand values back the way the rest of the app expects them: numbers, plain dates, ISO timestamps.
types.setTypeParser(20, (v) => Number(v)); // bigint
types.setTypeParser(1700, (v) => Number(v)); // numeric
types.setTypeParser(1082, (v) => v); // date stays "2026-10-19"
types.setTypeParser(1184, (v) => new Date(v).toISOString()); // timestamptz

/** The only database surface the app uses. Works with any Postgres, including Neon. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

const envSchema = z.object({ DATABASE_URL: z.string().url("DATABASE_URL must be a Postgres connection string") });

const globalForDb = globalThis as unknown as { pool?: Pool };

export function getPool(): Pool {
  if (!globalForDb.pool) {
    const { DATABASE_URL } = envSchema.parse(process.env);
    // The Neon connection string carries sslmode=require. A small pool suits serverless.
    globalForDb.pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
  }
  return globalForDb.pool;
}

/** Server-side only. Never import this from client components. */
export function getDb(): Db {
  const pool = getPool();
  return { query: async (text, params) => (await pool.query(text, params as unknown[])).rows };
}
