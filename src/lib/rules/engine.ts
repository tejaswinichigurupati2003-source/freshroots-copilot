import { z } from "zod";

/** Raghav's thresholds. Source of truth: CLAUDE.md (rules 1 to 5, assumptions A1 to A5). */
export const RULES_CONFIG = {
  historyWeeksRequired: 12,
  recentWeeks: 4,
  spikeRatio: 1.2,
  spikeOrderMultiple: 1.5,
  festivalUplift: 1.25,
  generalCover: { min: 6, max: 14 },
  highPerishableCover: { min: 3, max: 4 },
  edge: { dropRatio: 0.75, oneWeekSpikeVsMedian: 2.5 },
} as const;

/** The numbers a planner may change. Everything else in RULES_CONFIG is fixed by how the data and screens are built. */
export interface RuleSettings {
  spikeRatio: number;
  spikeOrderMultiple: number;
  festivalUplift: number;
  generalCover: { min: number; max: number };
  highPerishableCover: { min: number; max: number };
}

export const DEFAULT_RULE_SETTINGS: RuleSettings = {
  spikeRatio: RULES_CONFIG.spikeRatio,
  spikeOrderMultiple: RULES_CONFIG.spikeOrderMultiple,
  festivalUplift: RULES_CONFIG.festivalUplift,
  generalCover: { ...RULES_CONFIG.generalCover },
  highPerishableCover: { ...RULES_CONFIG.highPerishableCover },
};

export const flagSchema = z.enum(["STOCKOUT_RISK", "OVERSTOCK_RISK", "HIGH_DEMAND", "OK", "INSUFFICIENT_HISTORY"]);
export type Flag = z.infer<typeof flagSchema>;

export const skuInputSchema = z.object({
  /** Weekly units sold, oldest first. */
  weeklySales: z.array(z.number().nonnegative()),
  unitsOnHand: z.number().nonnegative(),
  openPoUnits: z.number().nonnegative(),
  standardQty: z.number().positive(),
  perishability: z.enum(["Low", "Medium", "High"]),
  isFestivalMonth: z.boolean(),
});
export type SkuInput = z.infer<typeof skuInputSchema>;

export type RuleId =
  | "RULE_1_HIGH_DEMAND"
  | "RULE_2_STOCKOUT_RISK"
  | "RULE_3_OVERSTOCK_RISK"
  | "RULE_4_FESTIVAL_UPLIFT"
  | "RULE_5_PERISHABLE_LIMITS"
  | "A5_INSUFFICIENT_HISTORY";

export interface SkuResult {
  flag: Flag;
  orderQty: number;
  /** Null when there is not enough history to compute it. */
  weeksOfCover: number | null;
  spikeRatio: number | null;
  effectiveStock: number;
  avg12: number | null;
  avg4: number | null;
  rulesFired: RuleId[];
}

export interface EdgeSignals {
  shortHistory: boolean;
  /** Last 4 weeks at least 25 percent below the 12-week average while the flag is OK. */
  recentDrop: boolean;
  /** One week above 2.5 times the median of the 12 weeks. Holds that week's index in `weeklySales` when set. */
  oneWeekSpikeIndex: number | null;
}

export type SkuResultWithSignals = SkuResult & { signals: EdgeSignals };

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Pure rules engine for one SKU. No I/O, no AI. */
export function evaluateSku(raw: SkuInput, settings: RuleSettings = DEFAULT_RULE_SETTINGS): SkuResult {
  const input = skuInputSchema.parse(raw);
  const { historyWeeksRequired, recentWeeks } = RULES_CONFIG;
  const { spikeRatio, spikeOrderMultiple, festivalUplift } = settings;
  const effectiveStock = input.unitsOnHand + input.openPoUnits; // A2

  if (input.weeklySales.length < historyWeeksRequired) {
    return {
      flag: "INSUFFICIENT_HISTORY", // A5
      orderQty: 0,
      weeksOfCover: null,
      spikeRatio: null,
      effectiveStock,
      avg12: null,
      avg4: null,
      rulesFired: ["A5_INSUFFICIENT_HISTORY"],
    };
  }

  const avg12 = mean(input.weeklySales.slice(-historyWeeksRequired));
  const avg4 = mean(input.weeklySales.slice(-recentWeeks));
  const ratio = avg12 > 0 ? avg4 / avg12 : 0;
  const isSpike = avg4 > spikeRatio * avg12; // A1: no festival uplift in the spike test

  const demand = input.isFestivalMonth ? avg12 * festivalUplift : avg12;
  const weeksOfCover = demand > 0 ? effectiveStock / demand : Number.POSITIVE_INFINITY;
  const limits = input.perishability === "High" ? settings.highPerishableCover : settings.generalCover; // A3

  const rulesFired: RuleId[] = [];
  if (input.isFestivalMonth) rulesFired.push("RULE_4_FESTIVAL_UPLIFT");
  if (input.perishability === "High") rulesFired.push("RULE_5_PERISHABLE_LIMITS");

  let flag: Flag = "OK";
  let orderQty = 0;
  if (weeksOfCover < limits.min) {
    flag = "STOCKOUT_RISK";
    orderQty = input.standardQty * (isSpike ? spikeOrderMultiple : 1); // A4
    rulesFired.push("RULE_2_STOCKOUT_RISK");
    if (isSpike) rulesFired.push("RULE_1_HIGH_DEMAND");
  } else if (weeksOfCover > limits.max) {
    flag = "OVERSTOCK_RISK";
    rulesFired.push("RULE_3_OVERSTOCK_RISK");
    if (isSpike) rulesFired.push("RULE_1_HIGH_DEMAND");
  } else if (isSpike) {
    flag = "HIGH_DEMAND";
    orderQty = input.standardQty * spikeOrderMultiple;
    rulesFired.push("RULE_1_HIGH_DEMAND");
  }

  return {
    flag,
    orderQty: Math.round(orderQty),
    weeksOfCover,
    spikeRatio: ratio,
    effectiveStock,
    avg12,
    avg4,
    rulesFired,
  };
}

/** Same as evaluateSku, plus edge-case signals computed by code for the LLM and the dashboard. */
export function evaluateSkuWithSignals(input: SkuInput, settings: RuleSettings = DEFAULT_RULE_SETTINGS): SkuResultWithSignals {
  const result = evaluateSku(input, settings);
  const { historyWeeksRequired, edge } = RULES_CONFIG;
  const shortHistory = input.weeklySales.length < historyWeeksRequired;

  let recentDrop = false;
  let oneWeekSpikeIndex: number | null = null;
  if (!shortHistory && result.avg12 !== null && result.avg4 !== null) {
    recentDrop = result.flag === "OK" && result.avg4 <= edge.dropRatio * result.avg12;

    const window = input.weeklySales.slice(-historyWeeksRequired);
    const offset = input.weeklySales.length - historyWeeksRequired;
    const limit = edge.oneWeekSpikeVsMedian * median(window);
    const peak = window.indexOf(Math.max(...window));
    oneWeekSpikeIndex = window[peak] > limit ? peak + offset : null;
  }

  return { ...result, signals: { shortHistory, recentDrop, oneWeekSpikeIndex } };
}
