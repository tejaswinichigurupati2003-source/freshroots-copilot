import { z } from "zod";
import { EDGE_CASE_TYPES, type SkuFacts } from "./facts";

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** One explanation. The model also echoes sku_id so a batched answer can be matched back to its SKU. */
export const explanationSchema = z
  .object({
    sku_id: z.string(),
    reason: z.string().min(1).refine((r) => wordCount(r) < 40, "reason must be under 40 words"),
    edge_case_type: z.enum(EDGE_CASE_TYPES),
    evidence: z.string(),
  })
  .strict();

export type LlmExplanation = z.infer<typeof explanationSchema>;

export const explanationBatchSchema = z.array(z.unknown());

export interface Explanation {
  reason: string;
  edge_case_type: (typeof EDGE_CASE_TYPES)[number];
  evidence: string;
  explanation_source: "llm" | "template";
}

const NUMBER_PATTERN = /\d[\d,]*(?:\.\d+)?/g;

function numbersIn(text: string): number[] {
  return (text.match(NUMBER_PATTERN) ?? []).map((n) => Number(n.replace(/,/g, "")));
}

/** Every number in the facts, plus its whole-number and one-decimal roundings. */
function allowedNumbers(facts: SkuFacts): Set<number> {
  const allowed = new Set<number>();
  for (const n of numbersIn(JSON.stringify(facts))) {
    allowed.add(n);
    allowed.add(Math.round(n));
    allowed.add(Math.round(n * 10) / 10);
  }
  return allowed;
}

/** Numbers in `text` that are not present in the facts. Empty means the text is safe to show. */
export function inventedNumbers(text: string, facts: SkuFacts): number[] {
  const allowed = allowedNumbers(facts);
  return numbersIn(text).filter((n) => !allowed.has(n));
}
