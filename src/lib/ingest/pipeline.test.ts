import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkFreshness, FreshnessError, resolveRunDate } from "./freshness";
import { isAuthorizedCron } from "./cron-auth";
import { runPipeline } from "./pipeline";
import { memoryStore, seedData, sourceFrom } from "./test-support";

const root = path.resolve(import.meta.dirname, "../../..");

const expected = parse(readFileSync(path.join(root, "data/expected/expected_results.csv"), "utf8"), {
  columns: true,
  skip_empty_lines: true,
}) as { SKU_ID: string; Expected_Flag: string; Expected_Order_Qty: string }[];

describe("runPipeline", () => {
  it("saves one pending recommendation per SKU that equals the answer key", async () => {
    const { store, saved, runs, audit } = memoryStore();
    const result = await runPipeline("2026-10-19", "test", { source: sourceFrom(seedData()), store });

    expect(result.status).toBe("completed");
    expect(saved).toHaveLength(18);
    expect(saved.every((r) => r.status === "pending")).toBe(true);
    for (const e of expected) {
      const rec = saved.find((r) => r.sku_id === e.SKU_ID)!;
      expect({ flag: rec.flag, qty: rec.recommended_qty }).toEqual({ flag: e.Expected_Flag, qty: Number(e.Expected_Order_Qty) });
    }
    expect(runs[0].status).toBe("completed");
    expect(audit.map((a) => a.action)).toEqual(["run_started", "run_completed"]);
  });

  it("records the edge-case signals for SKU016, SKU017 and SKU018", async () => {
    const { store, saved } = memoryStore();
    await runPipeline("2026-10-19", "test", { source: sourceFrom(seedData()), store });
    const signals = (id: string) => saved.find((r) => r.sku_id === id)!.signals;

    expect(signals("SKU016")).toMatchObject({ shortHistory: true });
    expect(signals("SKU017")).toMatchObject({ recentDrop: true });
    expect(signals("SKU018")).toMatchObject({ oneWeekSpike: true, oneWeekSpikeWeek: "2026-W41" });
  });

  it("blocks the run and saves nothing when stock data is stale", async () => {
    const { store, saved, runs, audit } = memoryStore();
    const result = await runPipeline("2026-10-30", "test", { source: sourceFrom(seedData()), store });

    expect(result).toMatchObject({ status: "blocked", reason: "stale_data" });
    expect(result.status === "blocked" && result.message).toContain("11 days old");
    expect(saved).toHaveLength(0);
    expect(runs[0].status).toBe("blocked");
    expect(audit.map((a) => a.action)).toEqual(["run_started", "run_blocked"]);
  });

  it("blocks the run when a required table is empty", async () => {
    const { store, saved } = memoryStore();
    const result = await runPipeline("2026-10-19", "test", { source: sourceFrom({ ...seedData(), sales: [] }), store });

    expect(result).toMatchObject({ status: "blocked", reason: "stale_data" });
    expect(result.status === "blocked" && result.message).toBe("Required data is missing: sales is empty.");
    expect(saved).toHaveLength(0);
  });

  it("blocks the run when the kill switch is on", async () => {
    const { store, saved, runs } = memoryStore({ active: true, reason: "Loss above 50 lakh" });
    const result = await runPipeline("2026-10-19", "cron", { source: sourceFrom(seedData()), store });

    expect(result).toMatchObject({ status: "blocked", reason: "kill_switch" });
    expect(result.status === "blocked" && result.message).toContain("Loss above 50 lakh");
    expect(saved).toHaveLength(0);
    expect(runs[0].status).toBe("blocked");
  });

  it("reports unexpected errors as a failed run", async () => {
    const { store, runs } = memoryStore();
    const source = { ...sourceFrom(seedData()), getStock: async () => Promise.reject(new Error("db down")) };
    const result = await runPipeline("2026-10-19", "test", { source, store });

    expect(result).toMatchObject({ status: "failed", message: "db down" });
    expect(runs[0].status).toBe("failed");
  });
});

describe("checkFreshness", () => {
  const { openPos: _openPos, ...data } = seedData();

  it("accepts stock exactly 7 days old and rejects 8", () => {
    expect(() => checkFreshness("2026-10-26", data)).not.toThrow();
    expect(() => checkFreshness("2026-10-27", data)).toThrow(FreshnessError);
  });

  it("names SKUs that have no stock snapshot", () => {
    expect(() => checkFreshness("2026-10-19", { ...data, stock: data.stock.slice(1) })).toThrow("No stock snapshot for: SKU001.");
  });

  it("fails when the calendar has no row for the run month", () => {
    expect(() => checkFreshness("2027-06-19", { ...data, stock: data.stock.map((s) => ({ ...s, as_of_date: "2027-06-19" })) })).toThrow(
      "no row for 2027-06",
    );
  });
});

describe("resolveRunDate", () => {
  it("uses RUN_AS_OF when set, otherwise today", () => {
    expect(resolveRunDate({ RUN_AS_OF: "2026-10-19" }, new Date("2026-11-30T00:00:00Z"))).toBe("2026-10-19");
    expect(resolveRunDate({}, new Date("2026-11-30T12:00:00Z"))).toBe("2026-11-30");
  });
});

describe("isAuthorizedCron", () => {
  it("accepts only the exact bearer token", () => {
    expect(isAuthorizedCron("Bearer s3cret", "s3cret")).toBe(true);
    expect(isAuthorizedCron("Bearer wrong!", "s3cret")).toBe(false);
    expect(isAuthorizedCron(null, "s3cret")).toBe(false);
  });

  it("rejects everything when CRON_SECRET is not set", () => {
    expect(isAuthorizedCron("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false);
  });
});
