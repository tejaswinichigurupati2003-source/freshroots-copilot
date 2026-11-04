import { carryOver, type CarryOver, type PastLine, type SentDraft } from "../approval/carry-over";
import { exposureInr } from "../approval/exposure";
import { rulesFromSignals } from "../rules/settings";
import type { Db } from "./client";

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
  /** Indicative rupees at risk if nothing is done (see approval/exposure.ts). */
  exposure_inr: number;
  perishability: string;
  standard_qty: number;
  unit_cost_inr: number;
  /** Expected arrival dates of the open POs for this SKU. */
  open_po_arrivals: string[];
  /** Context from earlier runs. Information only. */
  carry: CarryOver;
  decision: DecisionSummary | null;
}

export interface Dashboard {
  latestRun: RunSummary | null;
  /** The run the table shows: the most recent one that completed. */
  shownRun: RunSummary | null;
  rows: DashboardRow[];
  killSwitch: { active: boolean; reason: string | null; tripped_at: string | null };
  stockAsOf: string | null;
  /** Months (as 2026-10) flagged as festival months in the calendar. */
  festivalMonths: string[];
}

const RUN_COLUMNS = "id, as_of_date, triggered_by, status, error, started_at, finished_at";

type FlatRow = Omit<DashboardRow, "decision" | "exposure_inr" | "open_po_arrivals" | "carry"> & {
  stockout_loss: number;
  overstock_loss: number;
  d_decided_by: string | null;
  d_action: string | null;
  d_final_qty: number | null;
  d_reason: string | null;
  d_decided_at: string | null;
};

const HISTORY_RUNS = 10;
const DRAFT_DAYS = 30;

/** Earlier completed runs, recent Zoho drafts and open POs, grouped by SKU for the carry-over notes. */
async function loadHistory(db: Db, shown: RunSummary) {
  const [pastRows, draftRows, poRows] = await Promise.all([
    db.query<{ sku_id: string; flag: string; action: string | null; final_qty: number | null; reason: string | null; decided_by: string | null; decided_at: string | null }>(
      `select r.sku_id, r.flag, d.action, d.final_qty, d.reason, d.decided_by, d.decided_at
         from recommendations r
         join runs ru on ru.id = r.run_id
         left join decisions d on d.recommendation_id = r.id
        where r.run_id in (select id from runs where status = 'completed' and id <> $1 and started_at < $2 order by started_at desc limit ${HISTORY_RUNS})
        order by ru.started_at desc`,
      [shown.id, shown.started_at],
    ),
    db.query<{ lines: { sku_id: string; quantity: number }[]; external_id: string; created_at: string }>(
      `select lines, external_id, created_at from zoho_drafts
        where run_id <> $1 and external_id is not null and created_at > now() - make_interval(days => ${DRAFT_DAYS})
        order by created_at desc`,
      [shown.id],
    ),
    db.query<{ po_id: string; sku_id: string; expected_arrival: string }>("select po_id, sku_id, expected_arrival from open_pos"),
  ]);

  const past = new Map<string, PastLine[]>();
  for (const p of pastRows) {
    const line: PastLine = {
      flag: p.flag,
      decision: p.action === null ? null : { action: p.action, final_qty: p.final_qty as number, reason: p.reason, decided_by: p.decided_by as string, decided_at: p.decided_at as string },
    };
    past.set(p.sku_id, [...(past.get(p.sku_id) ?? []), line]);
  }

  const drafts = new Map<string, SentDraft[]>();
  for (const d of draftRows) {
    for (const l of d.lines) drafts.set(l.sku_id, [...(drafts.get(l.sku_id) ?? []), { externalId: d.external_id, quantity: l.quantity, createdAt: d.created_at }]);
  }

  const arrivals = new Map<string, string[]>();
  for (const po of poRows) arrivals.set(po.sku_id, [...(arrivals.get(po.sku_id) ?? []), po.expected_arrival]);

  return { past, drafts, arrivals, openPoIds: poRows.map((p) => p.po_id) };
}

export async function loadDashboard(db: Db): Promise<Dashboard> {
  const [latestRuns, shownRuns, killSwitches, stocks, calendar] = await Promise.all([
    db.query<RunSummary>(`select ${RUN_COLUMNS} from runs order by started_at desc limit 1`),
    db.query<RunSummary>(`select ${RUN_COLUMNS} from runs where status = 'completed' order by started_at desc limit 1`),
    db.query<{ is_active: boolean; reason: string | null; tripped_at: string | null }>("select is_active, reason, tripped_at from system_state where key = 'kill_switch'"),
    db.query<{ as_of_date: string }>("select max(as_of_date) as as_of_date from stock_snapshots"),
    db.query<{ year_month: string }>("select year_month from calendar where is_festival_month"),
  ]);

  const shown = shownRuns[0] ?? null;
  let rows: DashboardRow[] = [];
  if (shown) {
    const flat = await db.query<FlatRow>(
      `select r.id, r.sku_id, s.sku_name, r.flag, r.recommended_qty, r.weeks_of_cover, r.spike_ratio, r.effective_stock,
              r.signals, r.reason, r.edge_case_type, r.evidence, r.explanation_source, r.status,
              s.perishability, s.standard_reorder_qty as standard_qty, coalesce(e.unit_cost_inr, 0) as unit_cost_inr,
              coalesce(e.stockout_loss_per_unit_inr, 0) as stockout_loss, coalesce(e.overstock_loss_per_unit_inr, 0) as overstock_loss,
              d.decided_by as d_decided_by, d.action as d_action, d.final_qty as d_final_qty, d.reason as d_reason, d.decided_at as d_decided_at
         from recommendations r
         join skus s on s.sku_id = r.sku_id
         left join sku_economics e on e.sku_id = r.sku_id
         left join decisions d on d.recommendation_id = r.id
        where r.run_id = $1`,
      [shown.id],
    );
    const history = await loadHistory(db, shown);
    rows = flat.map(({ d_decided_by, d_action, d_final_qty, d_reason, d_decided_at, stockout_loss, overstock_loss, ...rest }) => ({
      ...rest,
      exposure_inr: exposureInr({
        flag: rest.flag,
        effectiveStock: rest.effective_stock,
        avg12: (rest.signals.avg12 as number | null | undefined) ?? null,
        festival: Boolean(rest.signals.isFestivalMonth),
        perishability: rest.perishability,
        stockoutLossPerUnit: stockout_loss,
        overstockLossPerUnit: overstock_loss,
        rules: rulesFromSignals(rest.signals),
      }),
      open_po_arrivals: history.arrivals.get(rest.sku_id) ?? [],
      carry: carryOver({ flag: rest.flag, past: history.past.get(rest.sku_id) ?? [], drafts: history.drafts.get(rest.sku_id) ?? [], openPoIds: history.openPoIds }),
      decision:
        d_decided_by === null
          ? null
          : { decided_by: d_decided_by, action: d_action as string, final_qty: d_final_qty as number, reason: d_reason, decided_at: d_decided_at as string },
    }));
  }

  const ks = killSwitches[0];
  return {
    latestRun: latestRuns[0] ?? null,
    shownRun: shown,
    rows,
    killSwitch: { active: ks?.is_active ?? false, reason: ks?.reason ?? null, tripped_at: ks?.tripped_at ?? null },
    stockAsOf: stocks[0]?.as_of_date ?? null,
    festivalMonths: calendar.map((c) => c.year_month),
  };
}
