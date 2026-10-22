import { runPipeline, type RecommendationInsert } from "../ingest/pipeline";
import { memoryStore, seedData, sourceFrom } from "../ingest/test-support";
import type { SkuRow } from "../ingest/types";
import { explainAll, type LlmClient } from "../llm/explain";
import { evaluateSku } from "../rules/engine";
import type { SkuFacts } from "../llm/facts";

export interface RubricResult {
  id: string;
  scenario: string;
  sku: string;
  passed: boolean;
  detail: string;
}

const AS_OF = "2026-10-19";

/**
 * Stands in for Gemini. It answers from the facts the code passes in, quoting only numbers from those facts,
 * so the check proves the explanation path (prompt facts, JSON contract, number guard, saving) and not Gemini itself.
 */
function scriptedModel(): LlmClient {
  return {
    async generateJson({ prompt }) {
      const facts: SkuFacts[] = JSON.parse(prompt.split("### Input facts\n")[1].split("\n\n### Output")[0]);
      return JSON.stringify(
        facts.map((f) => {
          const type = f.history_weeks < 12 ? "NEW_LAUNCH" : f.spike_week ? "ONE_OFF_SPIKE" : f.recent_drop_percent !== null ? "DISTRIBUTOR_DROP" : "NONE";
          const evidence =
            type === "ONE_OFF_SPIKE"
              ? `Week ${f.spike_week} sold ${f.spike_week_units} against a median of ${f.median_12_week}.`
              : type === "DISTRIBUTOR_DROP"
                ? `The last 4 weeks are ${f.recent_drop_percent} percent below the 12-week average.`
                : "";
          return { sku_id: f.sku_id, reason: `Stock covers ${f.weeks_of_cover ?? "few"} weeks for ${f.sku_name}.`, edge_case_type: type, evidence };
        }),
      );
    },
  };
}

export async function runRubric(): Promise<RubricResult[]> {
  const data = seedData();
  const recs = new Map<string, RecommendationInsert>();
  const completed = await runPipeline(AS_OF, "rubric", { source: sourceFrom(data), store: memoryStore().store });
  if (completed.status !== "completed") throw new Error(`Baseline run did not complete: ${completed.message}`);
  completed.recommendations.forEach((r) => recs.set(r.sku_id, r));

  const items = completed.recommendations.map((rec) => ({ rec, sku: data.skus.find((s) => s.sku_id === rec.sku_id) as SkuRow }));
  const explanations = await explainAll(items, { client: scriptedModel(), minIntervalMs: 0 });

  const rec = (sku: string) => recs.get(sku)!;
  const results: RubricResult[] = [];
  const check = (id: string, scenario: string, sku: string, passed: boolean, detail: string) => results.push({ id, scenario, sku, passed, detail });
  const cover = (sku: string) => Number(rec(sku).weeks_of_cover?.toFixed(1));
  const flagQty = (sku: string) => `${rec(sku).flag} ${rec(sku).recommended_qty}`;

  check("T1", "Spike plus low cover", "SKU001", rec("SKU001").flag === "STOCKOUT_RISK" && rec("SKU001").recommended_qty === 750, flagQty("SKU001"));

  const noFestival = evaluateSkuFromRec(data, "SKU002", false);
  check("T2", "Festival uplift changes the result", "SKU002", rec("SKU002").flag === "OK" && cover("SKU002") === 11.5 && noFestival.flag === "OVERSTOCK_RISK", `OK at ${cover("SKU002")} wks; without uplift ${noFestival.flag} at ${noFestival.weeksOfCover?.toFixed(1)}`);

  check("T3", "Open PO prevents a duplicate reorder", "SKU003", rec("SKU003").flag === "OK" && rec("SKU003").effective_stock === 1220, `${rec("SKU003").flag}, effective stock ${rec("SKU003").effective_stock}, ${cover("SKU003")} wks`);
  check("T4", "Open PO covers a perishable SKU", "SKU004", rec("SKU004").flag === "OK" && cover("SKU004") === 3.3, `${rec("SKU004").flag} at ${cover("SKU004")} wks`);
  check("T5", "Overstock, non-perishable", "SKU006", rec("SKU006").flag === "OVERSTOCK_RISK" && rec("SKU006").recommended_qty === 0, `${flagQty("SKU006")} at ${cover("SKU006")} wks`);
  check("T6", "Perishable over 4-week maximum", "SKU007", rec("SKU007").flag === "OVERSTOCK_RISK" && cover("SKU007") === 4.1, `${rec("SKU007").flag} at ${cover("SKU007")} wks`);
  check("T7", "Perishable under 3-week minimum", "SKU011", rec("SKU011").flag === "STOCKOUT_RISK" && rec("SKU011").recommended_qty === 500, `${flagQty("SKU011")} at ${cover("SKU011")} wks`);
  check("T8", "Open PO only partly covers the gap", "SKU013", rec("SKU013").flag === "STOCKOUT_RISK" && rec("SKU013").recommended_qty === 120 && cover("SKU013") === 5.3, `${flagQty("SKU013")} at ${cover("SKU013")} wks`);
  check("T9", "New launch, 3 weeks of history", "SKU016", rec("SKU016").flag === "INSUFFICIENT_HISTORY" && rec("SKU016").signals.shortHistory === true, `${rec("SKU016").flag}, edge signal ${rec("SKU016").signals.shortHistory}`);

  const e17 = explanations.get("SKU017")!;
  check("T10", "Distributor drop (rules miss it)", "SKU017", rec("SKU017").flag === "OK" && e17.edge_case_type === "DISTRIBUTOR_DROP" && e17.explanation_source === "llm", `Rules ${rec("SKU017").flag}; model (mocked) says ${e17.edge_case_type}`);

  const e18 = explanations.get("SKU018")!;
  check("T11", "One-week spike", "SKU018", rec("SKU018").flag === "STOCKOUT_RISK" && rec("SKU018").recommended_qty === 225 && e18.edge_case_type === "ONE_OFF_SPIKE" && e18.explanation_source === "llm", `${flagQty("SKU018")}; model (mocked) says ${e18.edge_case_type}`);

  const stale = await runPipeline("2026-10-30", "rubric", { source: sourceFrom(data), store: memoryStore().store });
  const empty = await runPipeline(AS_OF, "rubric", { source: sourceFrom({ ...data, stock: [] }), store: memoryStore().store });
  check(
    "T12",
    "Stale or missing data",
    "all",
    stale.status === "blocked" && empty.status === "blocked" && stale.reason === "stale_data" && empty.reason === "stale_data",
    `stale: ${stale.status === "blocked" ? stale.message.slice(0, 40) : stale.status}; empty: ${empty.status === "blocked" ? empty.message : empty.status}`,
  );

  return results;
}

/** Re-runs one SKU through the engine with the festival uplift switched off. */
function evaluateSkuFromRec(data: ReturnType<typeof seedData>, sku: string, isFestivalMonth: boolean) {
  const master = data.skus.find((s) => s.sku_id === sku)!;
  return evaluateSku({
    weeklySales: data.sales.filter((s) => s.sku_id === sku).sort((a, b) => a.week.localeCompare(b.week)).map((s) => s.units_sold),
    unitsOnHand: data.stock.find((s) => s.sku_id === sku)!.units_on_hand,
    openPoUnits: data.openPos.filter((p) => p.sku_id === sku).reduce((n, p) => n + p.qty_units, 0),
    standardQty: master.standard_reorder_qty,
    perishability: master.perishability,
    isFestivalMonth,
  });
}

/** The seven SKUs the rubric says must stay quiet. Reported as a bonus row, not part of the 12 points. */
export const QUIET_SKUS = ["SKU005", "SKU008", "SKU009", "SKU010", "SKU012", "SKU014", "SKU015"];

export async function quietSkusStayOk(): Promise<{ passed: boolean; detail: string }> {
  const run = await runPipeline(AS_OF, "rubric", { source: sourceFrom(seedData()), store: memoryStore().store });
  if (run.status !== "completed") return { passed: false, detail: "run did not complete" };
  const loud = run.recommendations.filter((r) => QUIET_SKUS.includes(r.sku_id) && r.flag !== "OK");
  return { passed: loud.length === 0, detail: loud.length === 0 ? "all 7 are OK" : `flagged: ${loud.map((r) => r.sku_id).join(", ")}` };
}
