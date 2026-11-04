import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_SETTINGS, evaluateSku, type SkuInput } from "./engine";
import { parseRuleForm, ruleChanges, rulesFromSignals } from "./settings";

const form = {
  spikePercent: "120",
  spikeOrderMultiple: "1.5",
  festivalUplift: "1.25",
  generalMin: "6",
  generalMax: "14",
  perishableMin: "3",
  perishableMax: "4",
  reason: "Checking the defaults",
};

describe("parseRuleForm", () => {
  it("accepts the documented rules and turns the spike percentage into a ratio", () => {
    const result = parseRuleForm(form);
    expect(result).toEqual({ ok: true, settings: DEFAULT_RULE_SETTINGS, reason: "Checking the defaults" });
  });

  it("rejects non-numbers and blanks", () => {
    expect(parseRuleForm({ ...form, festivalUplift: "abc" })).toEqual({ ok: false, error: "Festival uplift must be a number." });
    expect(parseRuleForm({ ...form, generalMax: "" })).toEqual({ ok: false, error: "Maximum cover must be a number." });
  });

  it("rejects a minimum cover that is not below the maximum", () => {
    const result = parseRuleForm({ ...form, generalMin: "14", generalMax: "6" });
    expect(result).toEqual({ ok: false, error: "Minimum cover must be lower than maximum cover." });
    expect(parseRuleForm({ ...form, perishableMin: "5", perishableMax: "4" })).toEqual({ ok: false, error: "Perishable: Minimum cover must be lower than maximum cover." });
  });

  it("rejects values outside the safe ranges", () => {
    expect(parseRuleForm({ ...form, spikePercent: "100" }).ok).toBe(false);
    expect(parseRuleForm({ ...form, spikePercent: "400" }).ok).toBe(false);
    expect(parseRuleForm({ ...form, festivalUplift: "0.9" }).ok).toBe(false);
    expect(parseRuleForm({ ...form, generalMax: "60" }).ok).toBe(false);
  });

  it("needs a reason", () => {
    expect(parseRuleForm({ ...form, reason: " no " }).ok).toBe(false);
  });
});

describe("ruleChanges", () => {
  it("lists only what changed", () => {
    const after = { ...DEFAULT_RULE_SETTINGS, festivalUplift: 1.4, generalCover: { min: 5, max: 14 } };
    expect(ruleChanges(DEFAULT_RULE_SETTINGS, after)).toEqual([
      { label: "Festival uplift", from: 1.25, to: 1.4 },
      { label: "Minimum cover (weeks)", from: 6, to: 5 },
    ]);
    expect(ruleChanges(DEFAULT_RULE_SETTINGS, DEFAULT_RULE_SETTINGS)).toEqual([]);
  });
});

describe("rulesFromSignals", () => {
  it("reads the saved rules and falls back to the defaults for older runs", () => {
    const custom = { ...DEFAULT_RULE_SETTINGS, festivalUplift: 1.4 };
    expect(rulesFromSignals({ rulesUsed: custom })).toEqual(custom);
    expect(rulesFromSignals({})).toEqual(DEFAULT_RULE_SETTINGS);
    expect(rulesFromSignals({ rulesUsed: { spikeRatio: "x" } })).toEqual(DEFAULT_RULE_SETTINGS);
  });
});

describe("engine with changed settings", () => {
  const sku: SkuInput = { weeklySales: Array(12).fill(100), unitsOnHand: 500, openPoUnits: 0, standardQty: 200, perishability: "Low", isFestivalMonth: false };

  it("gives the same answer as before with the defaults (5 weeks of cover is a stockout)", () => {
    expect(evaluateSku(sku).flag).toBe("STOCKOUT_RISK");
    expect(evaluateSku(sku, DEFAULT_RULE_SETTINGS)).toEqual(evaluateSku(sku));
  });

  it("follows a lowered minimum cover", () => {
    expect(evaluateSku(sku, { ...DEFAULT_RULE_SETTINGS, generalCover: { min: 4, max: 14 } }).flag).toBe("OK");
  });

  it("follows the spike multiple and the festival uplift", () => {
    const spiking = { ...sku, unitsOnHand: 300, weeklySales: [...Array(8).fill(100), ...Array(4).fill(150)] };
    expect(evaluateSku(spiking, { ...DEFAULT_RULE_SETTINGS, spikeOrderMultiple: 2 }).orderQty).toBe(400);
    const festival = { ...sku, unitsOnHand: 800, isFestivalMonth: true };
    expect(evaluateSku(festival).flag).toBe("OK");
    expect(evaluateSku(festival, { ...DEFAULT_RULE_SETTINGS, festivalUplift: 1.5 }).flag).toBe("STOCKOUT_RISK");
  });
});
