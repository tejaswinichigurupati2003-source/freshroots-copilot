import type { Explanation } from "../llm/contract";
import { evaluateSkuWithSignals, type Flag } from "../rules/engine";
import { checkFreshness, FreshnessError } from "./freshness";
import { loadPipelineData, type DataSource, type PipelineData, type SkuRow } from "./types";

const TREND_WEEKS = 12;

export interface RecommendationInsert {
  sku_id: string;
  flag: Flag;
  recommended_qty: number;
  weeks_of_cover: number | null;
  spike_ratio: number | null;
  effective_stock: number;
  signals: Record<string, unknown>;
  status: "pending";
}

export interface AuditEntry {
  actor: string;
  action: string;
  entity?: string;
  entity_id?: string;
  details?: Record<string, unknown>;
}

/** Persistence the pipeline needs. The Supabase version lives in src/lib/db/run-store.ts. */
export interface RunStore {
  getKillSwitch(): Promise<{ active: boolean; reason: string | null }>;
  createRun(asOfDate: string, triggeredBy: string): Promise<string>;
  finishRun(runId: string, status: "completed" | "blocked" | "failed", error?: string): Promise<void>;
  saveRecommendations(runId: string, rows: RecommendationInsert[]): Promise<void>;
  /** Writes reason, edge_case_type, evidence and explanation_source only. Never flags or quantities. */
  saveExplanations(runId: string, explanations: Map<string, Explanation>): Promise<void>;
  audit(entry: AuditEntry): Promise<void>;
}

/** Adds words to the recommendations. Supplied by the caller so the pipeline works without an LLM. */
export type Explainer = (items: { rec: RecommendationInsert; sku: SkuRow }[]) => Promise<Map<string, Explanation>>;

export type PipelineResult =
  | { status: "completed"; runId: string; recommendations: RecommendationInsert[] }
  | { status: "blocked"; runId: string; reason: "kill_switch" | "stale_data"; message: string }
  | { status: "failed"; runId: string; message: string };

const finiteOrNull = (n: number | null) => (n !== null && Number.isFinite(n) ? n : null);

/** Pure: turns loaded data into one recommendation per SKU using the rules engine. */
export function buildRecommendations(runDate: string, data: PipelineData): RecommendationInsert[] {
  const isFestivalMonth = data.calendar.find((c) => c.year_month === runDate.slice(0, 7))?.is_festival_month ?? false;

  return data.skus.map((sku) => {
    const weeks = data.sales
      .filter((s) => s.sku_id === sku.sku_id)
      .sort((a, b) => a.week.localeCompare(b.week));
    const unitsOnHand = data.stock
      .filter((s) => s.sku_id === sku.sku_id)
      .sort((a, b) => b.as_of_date.localeCompare(a.as_of_date))[0].units_on_hand;
    const openPoUnits = data.openPos.filter((p) => p.sku_id === sku.sku_id).reduce((sum, p) => sum + p.qty_units, 0);

    const result = evaluateSkuWithSignals({
      weeklySales: weeks.map((w) => w.units_sold),
      unitsOnHand,
      openPoUnits,
      standardQty: sku.standard_reorder_qty,
      perishability: sku.perishability,
      isFestivalMonth,
    });

    const spikeWeek = result.signals.oneWeekSpikeIndex === null ? null : weeks[result.signals.oneWeekSpikeIndex].week;

    return {
      sku_id: sku.sku_id,
      flag: result.flag,
      recommended_qty: result.orderQty,
      weeks_of_cover: finiteOrNull(result.weeksOfCover),
      spike_ratio: finiteOrNull(result.spikeRatio),
      effective_stock: result.effectiveStock,
      signals: {
        shortHistory: result.signals.shortHistory,
        recentDrop: result.signals.recentDrop,
        oneWeekSpike: result.signals.oneWeekSpikeIndex !== null,
        oneWeekSpikeWeek: spikeWeek,
        rulesFired: result.rulesFired,
        avg12: result.avg12,
        avg4: result.avg4,
        unitsOnHand,
        openPoUnits,
        isFestivalMonth,
        recentWeeks: weeks.slice(-TREND_WEEKS).map((w) => ({ week: w.week, units: w.units_sold })),
      },
      status: "pending" as const,
    };
  });
}

/**
 * One planning run: kill switch, freshness, rules for every SKU, save, audit.
 * `asOf` is the run date (see resolveRunDate). Never throws for expected stops; returns a result instead.
 */
export async function runPipeline(
  asOf: string,
  triggeredBy: string,
  deps: { source: DataSource; store: RunStore; explain?: Explainer; beforeLoad?: () => Promise<unknown> },
): Promise<PipelineResult> {
  const { source, store, explain, beforeLoad } = deps;
  const runId = await store.createRun(asOf, triggeredBy);
  await store.audit({ actor: triggeredBy, action: "run_started", entity: "run", entity_id: runId, details: { asOf } });

  const stop = async (reason: "kill_switch" | "stale_data", message: string): Promise<PipelineResult> => {
    await store.finishRun(runId, "blocked", message);
    await store.audit({ actor: "system", action: "run_blocked", entity: "run", entity_id: runId, details: { reason, message } });
    return { status: "blocked", runId, reason, message };
  };

  try {
    const killSwitch = await store.getKillSwitch();
    if (killSwitch.active) {
      return await stop("kill_switch", `Kill switch is on${killSwitch.reason ? `: ${killSwitch.reason}` : ""}. Runs are paused until it is resumed.`);
    }

    // Runs after the kill switch check so a paused system never calls Zoho. Live mode copies Zoho's open POs here.
    await beforeLoad?.();
    const data = await loadPipelineData(source);
    checkFreshness(asOf, data);

    const recommendations = buildRecommendations(asOf, data);
    await store.saveRecommendations(runId, recommendations);
    if (explain) {
      // Explanations are words only. A failure here must not stop the run or change a quantity.
      try {
        const items = recommendations.map((rec) => ({ rec, sku: data.skus.find((s) => s.sku_id === rec.sku_id)! }));
        await store.saveExplanations(runId, await explain(items));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await store.audit({ actor: "system", action: "explanations_failed", entity: "run", entity_id: runId, details: { message } });
      }
    }
    await store.finishRun(runId, "completed");
    await store.audit({
      actor: "system",
      action: "run_completed",
      entity: "run",
      entity_id: runId,
      details: { skus: recommendations.length, flagged: recommendations.filter((r) => r.flag !== "OK").length },
    });
    return { status: "completed", runId, recommendations };
  } catch (err) {
    if (err instanceof FreshnessError) return stop("stale_data", err.message);
    const message = err instanceof Error ? err.message : String(err);
    await store.finishRun(runId, "failed", message);
    await store.audit({ actor: "system", action: "run_failed", entity: "run", entity_id: runId, details: { message } });
    return { status: "failed", runId, message };
  }
}
