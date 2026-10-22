import { describe, expect, it } from "vitest";
import type { AuditEntry } from "../ingest/pipeline";
import { MAX_PIN_ATTEMPTS, pinMatches, resumeKillSwitch } from "./kill-switch";
import { lossLevel, recordLoss } from "./loss";
import { checkRejectionWarning, rejectionStatus } from "./rejection";
import { getThresholds, type KillSwitchState, type MonitorStore } from "./types";

const NOW = new Date("2026-10-22T10:00:00Z");
const thresholds = getThresholds({});

function memoryStore(options: { decisions?: { action: string; decided_at: string }[]; killSwitch?: Partial<KillSwitchState>; baselinePeriods?: string[] } = {}) {
  const audit: (AuditEntry & { at: Date })[] = [];
  const state: KillSwitchState = { active: false, reason: null, tripped_at: null, resumed_at: null, resumed_by: null, ...options.killSwitch };
  const losses: Record<string, unknown>[] = [];
  const store: MonitorStore = {
    listDecisionsSince: async () => options.decisions ?? [],
    countAuditSince: async (action, since) => audit.filter((a) => a.action === action && a.at >= since).length,
    saveActualLoss: async (entry) => {
      if (options.baselinePeriods?.includes(entry.period)) throw new Error(`${entry.period} is a baseline period and cannot be overwritten.`);
      losses.push(entry);
    },
    getKillSwitch: async () => ({ ...state }),
    tripKillSwitch: async (reason, at) => {
      Object.assign(state, { active: true, reason, tripped_at: at.toISOString(), resumed_at: null, resumed_by: null });
    },
    resumeKillSwitch: async (by, at) => {
      Object.assign(state, { active: false, resumed_by: by, resumed_at: at.toISOString() });
    },
    audit: async (entry) => void audit.push({ ...entry, at: NOW }),
  };
  return { store, state, audit, losses };
}

const decisions = (rejected: number, total: number) =>
  Array.from({ length: total }, (_, i) => ({ action: i < rejected ? "rejected" : "approved", decided_at: NOW.toISOString() }));

describe("rejection rate early warning", () => {
  it("warns at 51 of 100 but not at exactly 50 of 100", () => {
    expect(rejectionStatus(decisions(51, 100), 20)).toMatchObject({ rate: 0.51, evaluated: true, warning: true });
    expect(rejectionStatus(decisions(50, 100), 20)).toMatchObject({ rate: 0.5, evaluated: true, warning: false });
  });

  it("is not evaluated below 20 decided lines, even at 100% rejected", () => {
    expect(rejectionStatus(decisions(19, 19), 20)).toMatchObject({ rate: null, evaluated: false, warning: false });
    expect(rejectionStatus(decisions(20, 20), 20)).toMatchObject({ evaluated: true, warning: true });
  });

  it("writes an audit entry once an hour and keeps running", async () => {
    const { store, audit } = memoryStore({ decisions: decisions(60, 100) });
    expect((await checkRejectionWarning(store, 20, NOW)).warning).toBe(true);
    await checkRejectionWarning(store, 20, NOW);
    expect(audit.map((a) => a.action)).toEqual(["early_warning_rejection_rate"]);
  });

  it("writes nothing below the threshold", async () => {
    const { store, audit } = memoryStore({ decisions: decisions(30, 100) });
    await checkRejectionWarning(store, 20, NOW);
    expect(audit).toHaveLength(0);
  });
});

describe("loss levels", () => {
  it("uses strict limits at 40 and 50 lakh", () => {
    expect(lossLevel(40, thresholds)).toBe("ok");
    expect(lossLevel(40.01, thresholds)).toBe("warn");
    expect(lossLevel(50, thresholds)).toBe("warn");
    expect(lossLevel(50.01, thresholds)).toBe("stop");
  });
});

describe("recordLoss", () => {
  const input = (stockout: string, overstock: string) => ({ period: "Oct-Dec 2026", stockoutLakh: stockout, overstockLakh: overstock, actor: "Deepa" });

  it("turns the kill switch on above 50 lakh and records why", async () => {
    const { store, state, audit } = memoryStore();
    const result = await recordLoss(store, input("32", "20"), thresholds, NOW);

    expect(result).toMatchObject({ ok: true, total: 52, level: "stop", tripped: true });
    expect(state.active).toBe(true);
    expect(state.reason).toContain("52 lakh");
    expect(audit.map((a) => a.action)).toEqual(["loss_entered", "kill_switch_tripped"]);
  });

  it("does not stop at exactly 50 lakh but warns", async () => {
    const { store, state, audit } = memoryStore();
    const result = await recordLoss(store, input("30", "20"), thresholds, NOW);
    expect(result).toMatchObject({ ok: true, level: "warn", tripped: false });
    expect(state.active).toBe(false);
    expect(audit.map((a) => a.action)).toEqual(["loss_entered", "loss_warning"]);
  });

  it("stays quiet below the warning line", async () => {
    const { store, audit } = memoryStore();
    expect(await recordLoss(store, input("15", "8"), thresholds, NOW)).toMatchObject({ level: "ok" });
    expect(audit.map((a) => a.action)).toEqual(["loss_entered"]);
  });

  it("does not trip twice when the switch is already on", async () => {
    const { store, audit } = memoryStore({ killSwitch: { active: true, reason: "earlier" } });
    const result = await recordLoss(store, input("40", "20"), thresholds, NOW);
    expect(result).toMatchObject({ tripped: false });
    expect(audit.map((a) => a.action)).not.toContain("kill_switch_tripped");
  });

  it.each([["-1", "5", "Loss cannot be negative."], ["abc", "5", "Enter a number."]])("rejects stockout %j", async (stockout, overstock, error) => {
    const { store, losses } = memoryStore();
    expect(await recordLoss(store, input(stockout, overstock), thresholds, NOW)).toEqual({ ok: false, error });
    expect(losses).toHaveLength(0);
  });

  it("refuses to overwrite a baseline period", async () => {
    const { store } = memoryStore({ baselinePeriods: ["Oct-Dec 2026"] });
    const result = await recordLoss(store, input("10", "5"), thresholds, NOW);
    expect(result).toMatchObject({ ok: false });
  });
});

describe("resumeKillSwitch", () => {
  const on = { active: true, reason: "Loss above limit" };
  const attempt = (store: MonitorStore, pin: string, actor = "Deepa") => resumeKillSwitch(store, { pin, actor }, "4321", NOW);

  it("rejects a wrong PIN, leaves the switch on, and logs the attempt", async () => {
    const { store, state, audit } = memoryStore({ killSwitch: on });
    expect(await attempt(store, "0000")).toEqual({ ok: false, error: "Wrong PIN." });
    expect(state.active).toBe(true);
    expect(audit.map((a) => a.action)).toEqual(["kill_switch_resume_failed"]);
  });

  it("resumes with the right PIN and records who and when", async () => {
    const { store, state, audit } = memoryStore({ killSwitch: on });
    expect((await attempt(store, "4321")).ok).toBe(true);
    expect(state).toMatchObject({ active: false, resumed_by: "Deepa", resumed_at: NOW.toISOString() });
    expect(audit.map((a) => a.action)).toEqual(["kill_switch_resumed"]);
  });

  it(`locks out after ${MAX_PIN_ATTEMPTS} wrong PINs, even for the right one`, async () => {
    const { store, state } = memoryStore({ killSwitch: on });
    for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) expect(await attempt(store, "0000")).toMatchObject({ error: "Wrong PIN." });

    expect(await attempt(store, "4321")).toMatchObject({ ok: false, error: expect.stringContaining("Too many wrong PINs") });
    expect(state.active).toBe(true);
  });

  it("refuses when no PIN is configured or the switch is off", async () => {
    const { store } = memoryStore({ killSwitch: on });
    expect(await resumeKillSwitch(store, { pin: "", actor: "Deepa" }, undefined, NOW)).toMatchObject({ ok: false });
    const off = memoryStore();
    expect(await attempt(off.store, "4321")).toEqual({ ok: false, error: "The kill switch is not on." });
  });

  it("compares PINs without caring about length", () => {
    expect(pinMatches("4321", "4321")).toBe(true);
    expect(pinMatches("432", "4321")).toBe(false);
    expect(pinMatches("", "4321")).toBe(false);
  });
});
