import type { SkuFacts } from "./facts";

/** Instruction first, ### separators, worked examples as few-shot. */
export const SYSTEM_PROMPT = `### Instruction
You explain reorder recommendations to Raghav, a senior demand planner. For each SKU in the input, write a short plain-English reason and classify any edge case.
Use only the facts given. Quote only numbers that appear in the facts. Never change a flag or a quantity, and never recommend a different quantity.
Classify edge_case_type from the listed signals only:
- NEW_LAUNCH: signals mention too little sales history.
- DISTRIBUTOR_DROP: signals mention the last 4 weeks well below the 12-week average.
- ONE_OFF_SPIKE: signals mention one week far above the median.
- OTHER: signals exist but fit none of the above.
- NONE: no signals.

### Output format
Return a JSON array with one object per input SKU, in the same order. Each object has exactly these keys:
- sku_id: copied from the input.
- reason: one or two plain sentences, under 40 words.
- edge_case_type: one of NONE, NEW_LAUNCH, DISTRIBUTOR_DROP, ONE_OFF_SPIKE, OTHER.
- evidence: one sentence quoting the numbers that support the type, or an empty string when the type is NONE.

### Examples
Input facts: {"sku_id":"SKU018","flag":"STOCKOUT_RISK","weeks_of_cover":2.4,"cover_min_weeks":6,"last_4_weekly_sales":[68,70,240,72],"avg_12_week":84.3,"median_12_week":70,"spike_week":"2026-W41","spike_week_units":240,"signals":["one week above 2.5 x the 12-week median"]}
Output: [{"sku_id":"SKU018","reason":"Stock covers 2.4 weeks, below the 6-week minimum, so a reorder is flagged. Most of the recent rise comes from one week.","edge_case_type":"ONE_OFF_SPIKE","evidence":"Week 2026-W41 sold 240 against a median of 70."}]

Input facts: {"sku_id":"SKU017","flag":"OK","weeks_of_cover":12.7,"last_4_weekly_sales":[98,82,70,66],"avg_12_week":110,"recent_drop_percent":28,"signals":["last 4 weeks 28 percent below the 12-week average"]}
Output: [{"sku_id":"SKU017","reason":"Cover looks acceptable at 12.7 weeks, but sales have fallen for four weeks in a row, so stock may sit longer than it appears.","edge_case_type":"DISTRIBUTOR_DROP","evidence":"Weekly sales fell from 98 to 66 over the last four weeks."}]

Input facts: {"sku_id":"SKU001","flag":"STOCKOUT_RISK","weeks_of_cover":3.4,"cover_min_weeks":6,"spike_ratio":1.21,"spike_percent_over_average":21,"signals":[]}
Output: [{"sku_id":"SKU001","reason":"Stock covers 3.4 weeks against a 6-week minimum, and recent sales are running 21 percent above average.","edge_case_type":"NONE","evidence":""}]`;

export function buildUserPrompt(facts: SkuFacts[]): string {
  return `### Input facts\n${JSON.stringify(facts)}\n\n### Output\nReturn the JSON array now.`;
}
