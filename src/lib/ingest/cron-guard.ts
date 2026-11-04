/** What the guard needs from the database. The Postgres version is in src/lib/db/cron-guard-store.ts. */
export interface CronGuardStore {
  /** True when this caller now holds the lock. Another scheduled call is running when it is false. */
  tryLock(): Promise<boolean>;
  /** Whether a scheduled run already started inside the window. */
  hasRecentScheduledRun(windowHours: number): Promise<boolean>;
  unlock(): Promise<void>;
}

export type GuardedResult<T> = { status: "skipped"; reason: "already_running" | "already_ran" } | { status: "ran"; result: T };

export const CRON_WINDOW_HOURS = 6;

/**
 * Vercel can deliver the same cron trigger more than once. Two deliveries a second apart used to start two full
 * runs. The lock stops a call that arrives while one is running, and the window check stops a late repeat.
 */
export async function runScheduledOnce<T>(store: CronGuardStore, run: () => Promise<T>, windowHours = CRON_WINDOW_HOURS): Promise<GuardedResult<T>> {
  if (!(await store.tryLock())) return { status: "skipped", reason: "already_running" };
  try {
    if (await store.hasRecentScheduledRun(windowHours)) return { status: "skipped", reason: "already_ran" };
    return { status: "ran", result: await run() };
  } finally {
    await store.unlock();
  }
}
