import type { SupabaseClient } from "@supabase/supabase-js";

export interface RunSummary {
  id: string;
  as_of_date: string;
  triggered_by: string;
  status: string;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface DecisionSummary {
  decided_by: string;
  action: string;
  final_qty: number;
  reason: string | null;
  decided_at: string;
}

export interface DashboardRow {
  id: string;
  sku_id: string;
  sku_name: string;
  flag: string;
  recommended_qty: number;
  weeks_of_cover: number | null;
  spike_ratio: number | null;
  effective_stock: number;
  signals: Record<string, unknown>;
  reason: string | null;
  edge_case_type: string | null;
  evidence: string | null;
  explanation_source: string | null;
  status: string;
  decision: DecisionSummary | null;
}

export interface Dashboard {
  latestRun: RunSummary | null;
  /** The run the table shows: the most recent one that completed. */
  shownRun: RunSummary | null;
  rows: DashboardRow[];
  killSwitch: { active: boolean; reason: string | null; tripped_at: string | null };
  stockAsOf: string | null;
}

const RUN_COLUMNS = "id, as_of_date, triggered_by, status, error, started_at, finished_at";

function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Could not read ${what}: ${result.error.message}`);
  return result.data;
}

export async function loadDashboard(db: SupabaseClient): Promise<Dashboard> {
  const [latestRun, shownRun, killSwitch, stock] = await Promise.all([
    db.from("runs").select(RUN_COLUMNS).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("runs").select(RUN_COLUMNS).eq("status", "completed").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("system_state").select("is_active, reason, tripped_at").eq("key", "kill_switch").maybeSingle(),
    db.from("stock_snapshots").select("as_of_date").order("as_of_date", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const shown = must(shownRun, "runs") as RunSummary | null;
  let rows: DashboardRow[] = [];
  if (shown) {
    const data = must(
      await db
        .from("recommendations")
        .select(
          "id, sku_id, flag, recommended_qty, weeks_of_cover, spike_ratio, effective_stock, signals, reason, edge_case_type, evidence, explanation_source, status, skus(sku_name), decisions(decided_by, action, final_qty, reason, decided_at)",
        )
        .eq("run_id", shown.id),
      "recommendations",
    ) as unknown as (Omit<DashboardRow, "sku_name" | "decision"> & {
      skus: { sku_name: string } | { sku_name: string }[] | null;
      decisions: DecisionSummary | DecisionSummary[] | null;
    })[];

    const first = <T>(v: T | T[] | null) => (Array.isArray(v) ? (v[0] ?? null) : v);
    rows = data.map(({ skus, decisions, ...rest }) => ({
      ...rest,
      sku_name: first(skus)?.sku_name ?? rest.sku_id,
      decision: first(decisions),
    }));
  }

  const ks = must(killSwitch, "kill switch");
  return {
    latestRun: must(latestRun, "runs") as RunSummary | null,
    shownRun: shown,
    rows,
    killSwitch: { active: ks?.is_active ?? false, reason: ks?.reason ?? null, tripped_at: ks?.tripped_at ?? null },
    stockAsOf: must(stock, "stock")?.as_of_date ?? null,
  };
}
