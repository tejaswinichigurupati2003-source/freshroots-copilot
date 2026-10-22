import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildRecommendations, type AuditEntry } from "../ingest/pipeline";
import { loadSeedRows, seedTables } from "../ingest/seed-files";
import type { PipelineData, SkuRow } from "../ingest/types";
import { inventedNumbers } from "./contract";
import { explainAll, type ExplainItem, type LlmClient } from "./explain";
import { buildFacts, type SkuFacts } from "./facts";

const seedRows = <T>(name: string) =>
  loadSeedRows(seedTables.find((t) => t.table === name)!, path.resolve(import.meta.dirname, "../../../data/seed")) as unknown as T[];

const data: PipelineData = {
  skus: seedRows<SkuRow>("skus"),
  sales: seedRows("sales_weekly"),
  stock: seedRows("stock_snapshots"),
  calendar: seedRows("calendar"),
  openPos: seedRows("open_pos"),
};

const recs = buildRecommendations("2026-10-19", data);
const items: ExplainItem[] = recs.map((rec) => ({ rec, sku: data.skus.find((s) => s.sku_id === rec.sku_id)! }));
const LLM_SKUS = ["SKU001", "SKU006", "SKU007", "SKU011", "SKU013", "SKU016", "SKU017", "SKU018"];

/** Reads the facts the prompt carried, so a fake model can answer using only real numbers. */
const factsIn = (prompt: string): SkuFacts[] => JSON.parse(prompt.split("### Input facts\n")[1].split("\n\n### Output")[0]);

const goodAnswer = (f: SkuFacts, overrides: Record<string, unknown> = {}) => ({
  sku_id: f.sku_id,
  reason: `Stock covers ${f.weeks_of_cover ?? "few"} weeks for ${f.sku_name}.`,
  edge_case_type: f.spike_week ? "ONE_OFF_SPIKE" : "NONE",
  evidence: "",
  ...overrides,
});

function fakeClient(respond: (prompt: string, call: number) => string | Error) {
  const prompts: string[] = [];
  const client: LlmClient = {
    async generateJson({ prompt }) {
      prompts.push(prompt);
      const out = respond(prompt, prompts.length);
      if (out instanceof Error) throw out;
      return out;
    },
  };
  return { client, prompts };
}

const options = (client: LlmClient | null, audit: AuditEntry[] = [], batchSize = 8) => ({
  client,
  batchSize,
  minIntervalMs: 0,
  audit: async (entry: AuditEntry) => {
    audit.push(entry);
  },
});

describe("explainAll with a working model", () => {
  it("uses valid output, marks it llm, and never sends plain OK SKUs", async () => {
    const { client, prompts } = fakeClient((p) => JSON.stringify(factsIn(p).map((f) => goodAnswer(f))));
    const result = await explainAll(items, options(client));

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).not.toContain("SKU005");
    for (const id of LLM_SKUS) expect(result.get(id)?.explanation_source).toBe("llm");
    expect(result.get("SKU018")?.edge_case_type).toBe("ONE_OFF_SPIKE");
    expect(result.get("SKU005")?.explanation_source).toBe("template");
    expect(result.size).toBe(18);
  });

  it("splits SKUs into batches", async () => {
    const { client, prompts } = fakeClient((p) => JSON.stringify(factsIn(p).map((f) => goodAnswer(f))));
    await explainAll(items, options(client, [], 3));
    expect(prompts).toHaveLength(3);
  });

  it("leaves flags and quantities exactly as the code set them", async () => {
    const before = JSON.stringify(recs);
    const { client } = fakeClient((p) => JSON.stringify(factsIn(p).map((f) => goodAnswer(f))));
    await explainAll(items, options(client));
    expect(JSON.stringify(recs)).toBe(before);
  });
});

describe("explainAll fallbacks", () => {
  it("retries once after invalid JSON, then accepts a valid answer", async () => {
    const { client, prompts } = fakeClient((p, call) => (call === 1 ? "not json" : JSON.stringify(factsIn(p).map((f) => goodAnswer(f)))));
    const result = await explainAll(items, options(client));
    expect(prompts).toHaveLength(2);
    expect(result.get("SKU001")?.explanation_source).toBe("llm");
  });

  it("falls back to templates after two invalid answers and logs it", async () => {
    const audit: AuditEntry[] = [];
    const { client, prompts } = fakeClient(() => "{ broken");
    const result = await explainAll(items, options(client, audit));

    expect(prompts).toHaveLength(2);
    expect(result.get("SKU001")).toMatchObject({ explanation_source: "template", edge_case_type: "NONE" });
    expect(audit.filter((a) => a.action === "llm_output_invalid")).toHaveLength(LLM_SKUS.length);
  });

  it("rejects a reason over 40 words and retries", async () => {
    const wordy = "word ".repeat(45).trim();
    const { client, prompts } = fakeClient((p, call) =>
      JSON.stringify(factsIn(p).map((f) => goodAnswer(f, call === 1 ? { reason: wordy } : {}))),
    );
    await explainAll(items, options(client));
    expect(prompts).toHaveLength(2);
  });

  it("falls back to templates when the call times out, without retrying", async () => {
    const audit: AuditEntry[] = [];
    const { client, prompts } = fakeClient(() => new Error("Gemini call timed out after 30000 ms"));
    const result = await explainAll(items, options(client, audit));

    expect(prompts).toHaveLength(1);
    expect(result.get("SKU016")).toMatchObject({ explanation_source: "template", edge_case_type: "NEW_LAUNCH" });
    expect(result.get("SKU017")?.edge_case_type).toBe("DISTRIBUTOR_DROP");
    expect(result.get("SKU018")?.edge_case_type).toBe("ONE_OFF_SPIKE");
    expect(audit.filter((a) => a.action === "llm_explanation_failed")).toHaveLength(LLM_SKUS.length);
  });

  it("replaces a reason containing an invented number and logs it", async () => {
    const audit: AuditEntry[] = [];
    const { client } = fakeClient((p) =>
      JSON.stringify(factsIn(p).map((f) => goodAnswer(f, f.sku_id === "SKU001" ? { reason: "Stock covers 99 weeks, so reorder." } : {})))
    );
    const result = await explainAll(items, options(client, audit));

    expect(result.get("SKU001")?.explanation_source).toBe("template");
    expect(result.get("SKU001")?.reason).not.toContain("99");
    expect(result.get("SKU006")?.explanation_source).toBe("llm");
    expect(audit).toEqual([expect.objectContaining({ action: "llm_invented_number", details: expect.objectContaining({ invented: [99] }) })]);
  });

  it("uses templates for everything when no client is configured", async () => {
    const result = await explainAll(items, options(null));
    expect([...result.values()].every((e) => e.explanation_source === "template")).toBe(true);
    expect(result.get("SKU016")?.edge_case_type).toBe("NEW_LAUNCH");
  });
});

describe("number guard", () => {
  const facts = buildFacts(recs.find((r) => r.sku_id === "SKU001")!, data.skus.find((s) => s.sku_id === "SKU001")!);

  it("allows numbers from the facts, including derived percentages and limits", () => {
    expect(inventedNumbers("Stock covers 3.4 weeks against a 6-week minimum, and sales run 21 percent above average.", facts)).toEqual([]);
  });

  it("flags numbers that are not in the facts", () => {
    expect(inventedNumbers("About 87 percent of stock is idle.", facts)).toEqual([87]);
  });
});

describe("explainAll with fenced JSON", () => {
  it("accepts an answer wrapped in a markdown code fence", async () => {
    const { client } = fakeClient((p) => "```json\n" + JSON.stringify(factsIn(p).map((f) => goodAnswer(f))) + "\n```");
    const result = await explainAll(items, options(client));
    expect(result.get("SKU001")?.explanation_source).toBe("llm");
  });
});
