import { z } from "zod";
import { DEFAULT_RULE_SETTINGS, type RuleSettings } from "./engine";

const cover = z
  .object({ min: z.number().min(0.5, "Minimum cover must be at least 0.5 weeks."), max: z.number().max(52, "Maximum cover cannot be more than 52 weeks.") })
  .refine((c) => c.min < c.max, "Minimum cover must be lower than maximum cover.");

/** What a saved set of rules must look like. Ranges keep a typo from turning every SKU into a stockout. */
export const ruleSettingsSchema = z.object({
  spikeRatio: z.number().gt(1, "The spike threshold must be above 100%.").max(3, "The spike threshold cannot be above 300%."),
  spikeOrderMultiple: z.number().min(0.5, "The spike order multiple must be at least 0.5.").max(5, "The spike order multiple cannot be above 5."),
  festivalUplift: z.number().min(1, "The festival uplift must be at least 1.").max(3, "The festival uplift cannot be above 3."),
  generalCover: cover,
  highPerishableCover: cover,
});

export const REASON_MIN_LENGTH = 5;

export type RuleFormResult = { ok: true; settings: RuleSettings; reason: string } | { ok: false; error: string };

const FIELDS = ["spikePercent", "spikeOrderMultiple", "festivalUplift", "generalMin", "generalMax", "perishableMin", "perishableMax"] as const;

const LABELS: Record<(typeof FIELDS)[number], string> = {
  spikePercent: "Spike threshold",
  spikeOrderMultiple: "Spike order multiple",
  festivalUplift: "Festival uplift",
  generalMin: "Minimum cover",
  generalMax: "Maximum cover",
  perishableMin: "Perishable minimum cover",
  perishableMax: "Perishable maximum cover",
};

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Turns the form's text fields into validated settings. The reason is required so every change can be explained later. */
export function parseRuleForm(fields: Record<string, string>): RuleFormResult {
  const num: Record<string, number> = {};
  for (const name of FIELDS) {
    const text = (fields[name] ?? "").trim();
    const value = text === "" ? NaN : Number(text);
    if (!Number.isFinite(value)) return { ok: false, error: `${LABELS[name]} must be a number.` };
    num[name] = value;
  }

  const parsed = ruleSettingsSchema.safeParse({
    spikeRatio: round(num.spikePercent / 100),
    spikeOrderMultiple: num.spikeOrderMultiple,
    festivalUplift: num.festivalUplift,
    generalCover: { min: num.generalMin, max: num.generalMax },
    highPerishableCover: { min: num.perishableMin, max: num.perishableMax },
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const place = issue.path[0] === "highPerishableCover" ? "Perishable: " : "";
    return { ok: false, error: place + issue.message };
  }

  const reason = (fields.reason ?? "").trim();
  if (reason.length < REASON_MIN_LENGTH) return { ok: false, error: `Say why you are changing the rules, in at least ${REASON_MIN_LENGTH} characters.` };
  return { ok: true, settings: parsed.data, reason };
}

export interface RuleChange {
  label: string;
  from: number;
  to: number;
}

/** The values that differ, for the audit log and the confirmation message. */
export function ruleChanges(before: RuleSettings, after: RuleSettings): RuleChange[] {
  const pairs: [string, number, number][] = [
    ["Spike threshold (%)", before.spikeRatio * 100, after.spikeRatio * 100],
    ["Spike order multiple", before.spikeOrderMultiple, after.spikeOrderMultiple],
    ["Festival uplift", before.festivalUplift, after.festivalUplift],
    ["Minimum cover (weeks)", before.generalCover.min, after.generalCover.min],
    ["Maximum cover (weeks)", before.generalCover.max, after.generalCover.max],
    ["Perishable minimum cover (weeks)", before.highPerishableCover.min, after.highPerishableCover.min],
    ["Perishable maximum cover (weeks)", before.highPerishableCover.max, after.highPerishableCover.max],
  ];
  return pairs.filter(([, from, to]) => round(from) !== round(to)).map(([label, from, to]) => ({ label, from: round(from), to: round(to) }));
}

/** The rules a run used, read back from a saved recommendation. Older runs saved none, so they used the defaults. */
export function rulesFromSignals(signals: Record<string, unknown>): RuleSettings {
  const parsed = ruleSettingsSchema.safeParse(signals.rulesUsed);
  return parsed.success ? parsed.data : DEFAULT_RULE_SETTINGS;
}
