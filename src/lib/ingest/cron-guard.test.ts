import { describe, expect, it } from "vitest";
import { runScheduledOnce, type CronGuardStore } from "./cron-guard";

function fakeStore(opts: { lockFree?: boolean; recent?: boolean } = {}) {
  const calls: string[] = [];
  const store: CronGuardStore = {
    tryLock: async () => {
      calls.push("lock");
      return opts.lockFree ?? true;
    },
    hasRecentScheduledRun: async () => {
      calls.push("recent?");
      return opts.recent ?? false;
    },
    unlock: async () => void calls.push("unlock"),
  };
  return { store, calls };
}

describe("runScheduledOnce", () => {
  it("runs once and lets go of the lock", async () => {
    const { store, calls } = fakeStore();
    const result = await runScheduledOnce(store, async () => "done");
    expect(result).toEqual({ status: "ran", result: "done" });
    expect(calls).toEqual(["lock", "recent?", "unlock"]);
  });

  it("skips a call that arrives while another is running, without touching the lock it never got", async () => {
    const { store, calls } = fakeStore({ lockFree: false });
    let ran = false;
    const result = await runScheduledOnce(store, async () => void (ran = true));
    expect(result).toEqual({ status: "skipped", reason: "already_running" });
    expect(ran).toBe(false);
    expect(calls).toEqual(["lock"]);
  });

  it("skips a late repeat when a scheduled run already started in the window", async () => {
    const { store, calls } = fakeStore({ recent: true });
    let ran = false;
    const result = await runScheduledOnce(store, async () => void (ran = true));
    expect(result).toEqual({ status: "skipped", reason: "already_ran" });
    expect(ran).toBe(false);
    expect(calls).toEqual(["lock", "recent?", "unlock"]);
  });

  it("lets go of the lock even when the run fails", async () => {
    const { store, calls } = fakeStore();
    await expect(
      runScheduledOnce(store, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(calls).toEqual(["lock", "recent?", "unlock"]);
  });

  it("two deliveries a second apart start one run", async () => {
    let held = false;
    let runs = 0;
    const store: CronGuardStore = {
      tryLock: async () => (held ? false : (held = true)),
      hasRecentScheduledRun: async () => false,
      unlock: async () => void (held = false),
    };
    const slowRun = () => new Promise<void>((resolve) => setTimeout(() => (runs++, resolve()), 20));
    const [a, b] = await Promise.all([runScheduledOnce(store, slowRun), runScheduledOnce(store, slowRun)]);
    expect(runs).toBe(1);
    expect([a.status, b.status].sort()).toEqual(["ran", "skipped"]);
  });
});
