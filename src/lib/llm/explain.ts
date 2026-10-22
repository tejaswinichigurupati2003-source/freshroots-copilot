import type { AuditEntry, RecommendationInsert } from "../ingest/pipeline";
import { explanationSchema, inventedNumbers, type Explanation } from "./contract";
import { buildFacts, needsLlm, type SkuFacts } from "./facts";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import { templateExplanation } from "./template";

export interface LlmClient {
  /** Returns the model's raw text (expected to be JSON). Rejects on network errors and timeouts. */
  generateJson(args: { system: string; prompt: string; timeoutMs: number }): Promise<string>;
}

export interface ExplainItem {
  rec: RecommendationInsert;
  sku: { sku_name: string; standard_reorder_qty: number; perishability: string };
}

export interface ExplainOptions {
  client: LlmClient | null;
  /** SKUs per Gemini call. */
  batchSize?: number;
  timeoutMs?: number;
  /** Minimum gap between calls, to stay inside free-tier rate limits. */
  minIntervalMs?: number;
  audit?: (entry: AuditEntry) => Promise<void>;
}

const DEFAULTS = { batchSize: 8, timeoutMs: 30_000, minIntervalMs: 5_000 };
const MAX_ATTEMPTS = 2; // first try plus one retry for invalid output

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseBatch(raw: string, wanted: Set<string>): Map<string, ReturnType<typeof explanationSchema.parse>> {
  const valid = new Map<string, ReturnType<typeof explanationSchema.parse>>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return valid;
  }
  if (!Array.isArray(parsed)) return valid;
  for (const item of parsed) {
    const result = explanationSchema.safeParse(item);
    if (result.success && wanted.has(result.data.sku_id) && !valid.has(result.data.sku_id)) {
      valid.set(result.data.sku_id, result.data);
    }
  }
  return valid;
}

/**
 * Writes words only: a reason, an edge-case type and evidence for each SKU. It never touches a flag or quantity.
 * Anything the LLM cannot supply safely (no key, timeout, bad JSON, invented numbers) falls back to a template.
 */
export async function explainAll(items: ExplainItem[], options: ExplainOptions): Promise<Map<string, Explanation>> {
  const { client, audit } = options;
  const batchSize = options.batchSize ?? DEFAULTS.batchSize;
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const minIntervalMs = options.minIntervalMs ?? DEFAULTS.minIntervalMs;

  const factsBySku = new Map<string, SkuFacts>(items.map((i) => [i.rec.sku_id, buildFacts(i.rec, i.sku)]));
  const result = new Map<string, Explanation>();
  const log = (action: string, skuIds: string[], details: Record<string, unknown> = {}) =>
    audit?.({ actor: "system", action, entity: "recommendation", details: { skuIds, ...details } });

  const useTemplate = async (skuId: string, action?: string, details?: Record<string, unknown>) => {
    result.set(skuId, templateExplanation(factsBySku.get(skuId)!));
    if (action) await log(action, [skuId], details);
  };

  const llmIds = items.filter((i) => needsLlm(i.rec)).map((i) => i.rec.sku_id);
  for (const item of items) {
    if (!llmIds.includes(item.rec.sku_id)) await useTemplate(item.rec.sku_id);
  }

  if (!client) {
    for (const id of llmIds) await useTemplate(id);
    return result;
  }

  let lastCallAt = 0;
  for (let start = 0; start < llmIds.length; start += batchSize) {
    let pending = llmIds.slice(start, start + batchSize);

    for (let attempt = 0; attempt < MAX_ATTEMPTS && pending.length > 0; attempt++) {
      const wait = lastCallAt + minIntervalMs - Date.now();
      if (lastCallAt > 0 && wait > 0) await sleep(wait);
      lastCallAt = Date.now();

      let raw: string;
      try {
        raw = await client.generateJson({
          system: SYSTEM_PROMPT,
          prompt: buildUserPrompt(pending.map((id) => factsBySku.get(id)!)),
          timeoutMs,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        for (const id of pending) await useTemplate(id, "llm_explanation_failed", { message });
        pending = [];
        break;
      }

      const valid = parseBatch(raw, new Set(pending));
      for (const [skuId, explanation] of valid) {
        const facts = factsBySku.get(skuId)!;
        const invented = [...inventedNumbers(explanation.reason, facts), ...inventedNumbers(explanation.evidence, facts)];
        if (invented.length > 0) {
          await useTemplate(skuId, "llm_invented_number", { invented, reason: explanation.reason, evidence: explanation.evidence });
        } else {
          result.set(skuId, {
            reason: explanation.reason,
            edge_case_type: explanation.edge_case_type,
            evidence: explanation.evidence,
            explanation_source: "llm",
          });
        }
      }
      pending = pending.filter((id) => !valid.has(id));
    }

    for (const id of pending) await useTemplate(id, "llm_output_invalid");
  }

  return result;
}
