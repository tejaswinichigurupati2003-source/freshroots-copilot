import type { PoolClient } from "pg";
import type { CronGuardStore } from "../ingest/cron-guard";
import { getPool } from "./client";

/** Arbitrary but fixed number that names this lock in Postgres. */
const LOCK_KEY = 7_424_001;

/**
 * The lock lives inside one open transaction on one connection. A session-level advisory lock does not work
 * here: Neon's pooled address (PgBouncer) can give each statement to a different server connection, so two
 * overlapping calls both "got" the lock. A transaction keeps its connection until it ends, and Postgres drops
 * the lock on COMMIT, ROLLBACK, or if the process dies.
 *
 * Create one per request and always reach unlock(), which also gives the connection back.
 */
export class PgCronGuardStore implements CronGuardStore {
  private client: PoolClient | null = null;

  async tryLock() {
    const client = await getPool().connect();
    try {
      await client.query("begin");
      const { rows } = await client.query<{ ok: boolean }>("select pg_try_advisory_xact_lock($1) as ok", [LOCK_KEY]);
      if (rows[0].ok) {
        this.client = client;
        return true;
      }
      await client.query("rollback");
    } catch (err) {
      await client.query("rollback").catch(() => {});
      client.release();
      throw err;
    }
    client.release();
    return false;
  }

  async hasRecentScheduledRun(windowHours: number) {
    const { rows } = await this.requireClient().query<{ found: boolean }>(
      "select exists (select 1 from runs where triggered_by = 'cron' and status in ('running', 'completed') and started_at > now() - make_interval(hours => $1)) as found",
      [windowHours],
    );
    return rows[0].found;
  }

  async unlock() {
    const client = this.client;
    if (!client) return;
    this.client = null;
    try {
      await client.query("commit");
    } finally {
      client.release();
    }
  }

  private requireClient() {
    if (!this.client) throw new Error("Cron guard used before tryLock");
    return this.client;
  }
}
