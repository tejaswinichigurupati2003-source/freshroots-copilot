import type { Explanation } from "./contract";
import type { EdgeCaseType, SkuFacts } from "./facts";

/** Edge-case type taken from the code's own signals. Used whenever the LLM is unavailable or rejected. */
export function edgeTypeFromSignals(facts: SkuFacts): EdgeCaseType {
  if (facts.history_weeks < 12) return "NEW_LAUNCH";
  if (facts.spike_week !== null) return "ONE_OFF_SPIKE";
  if (facts.recent_drop_percent !== null) return "DISTRIBUTOR_DROP";
  return "NONE";
}

function reasonFor(f: SkuFacts): string {
  const cover = f.weeks_of_cover === null ? "" : `${f.weeks_of_cover} weeks`;
  switch (f.flag) {
    case "STOCKOUT_RISK":
      return `Stock covers ${cover}, below the ${f.cover_min_weeks}-week minimum, so a reorder of ${f.recommended_qty} is flagged.`;
    case "OVERSTOCK_RISK":
      return `Stock covers ${cover}, above the ${f.cover_max_weeks}-week maximum, so the next order is paused.`;
    case "HIGH_DEMAND":
      return `Recent sales are ${f.spike_percent_over_average} percent above the 12-week average, so a reorder of ${f.recommended_qty} is flagged.`;
    case "INSUFFICIENT_HISTORY":
      return `Only ${f.history_weeks} weeks of sales history, too few for the rules. Please size this order yourself.`;
    default:
      return f.weeks_of_cover === null ? "No action needed." : `Stock covers ${cover}, inside the ${f.cover_min_weeks} to ${f.cover_max_weeks} week range.`;
  }
}

function evidenceFor(f: SkuFacts): string {
  const parts: string[] = [];
  if (f.spike_week !== null && f.spike_week_units !== null) parts.push(`Week ${f.spike_week} sold ${f.spike_week_units} against a 12-week median of ${f.median_12_week}.`);
  if (f.recent_drop_percent !== null) parts.push(`The last 4 weeks are ${f.recent_drop_percent} percent below the 12-week average.`);
  return parts.join(" ");
}

export function templateExplanation(facts: SkuFacts): Explanation {
  return {
    reason: reasonFor(facts),
    edge_case_type: edgeTypeFromSignals(facts),
    evidence: evidenceFor(facts),
    explanation_source: "template",
  };
}
