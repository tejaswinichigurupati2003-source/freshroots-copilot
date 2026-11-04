import Link from "next/link";
import { EdgeBadge, FLAG_TONES, FlagBadge } from "@/components/badges";
import { MonitorStrip } from "@/components/monitor-strip";
import { OversightPage } from "@/components/oversight";
import { PushButton } from "@/components/push-button";
import { RowActions } from "@/components/row-actions";
import { RulesPanel } from "@/components/rules-panel";
import { RunNowButton } from "@/components/run-now-button";
import { Sparkline } from "@/components/sparkline";
import { StatCards } from "@/components/stat-cards";
import { UpcomingRuns } from "@/components/upcoming-runs";
import { WeeklyChart } from "@/components/weekly-chart";
import { rupees } from "@/lib/approval/exposure";
import { applyFilter, countByFilter, FILTERS, parseFilter, type FilterId } from "@/lib/approval/filters";
import { decisionText, orderText } from "@/lib/approval/labels";
import { needsReview, sortForReview } from "@/lib/approval/review";
import { can } from "@/lib/approval/roles";
import { daysOfStockLeft, daysText, runOutCheck } from "@/lib/approval/stockout-timing";
import { salesTrend } from "@/lib/approval/trend";
import { purchaseValueInr, workingSteps } from "@/lib/approval/working";
import { getDb } from "@/lib/db/client";
import { loadDashboard, type Dashboard, type DashboardRow } from "@/lib/db/dashboard";
import { loadRules, type RulesView } from "@/lib/db/rules-store";
import { rulesFromSignals } from "@/lib/rules/settings";
import { getActingAs } from "@/lib/session";
import { getMonitorView } from "@/lib/shell-data";

export const dynamic = "force-dynamic";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";

function trend(row: DashboardRow): number[] {
  return ((row.signals.recentWeeks ?? []) as { units: number }[]).map((w) => w.units);
}

/** The decision as a soft chip, with who and when underneath. */
function DecisionStamp({ row, canDecide }: { row: DashboardRow; canDecide: boolean }) {
  const d = row.decision;
  if (!d) return canDecide ? <RowActions recommendationId={row.id} recommendedQty={row.recommended_qty} /> : <span className="text-sm italic text-ink-faint">Waiting for Raghav</span>;

  const rejected = d.action === "rejected";
  return (
    <div className="min-w-44">
      <span className="tag !text-[12.5px]" style={{ color: rejected ? "var(--color-tomato)" : "var(--color-leaf-deep)", background: rejected ? "var(--color-tomato-wash)" : "var(--color-leaf-wash)" }}>
        {rejected ? "✕" : "✓"} {decisionText(d.action, d.final_qty)}
      </span>
      <p className="mt-2 text-xs text-ink-soft">
        {d.decided_by}, {when(d.decided_at)}
      </p>
      {d.reason && <p className="mt-1 text-sm italic">&ldquo;{d.reason}&rdquo;</p>}
      {row.status === "pushed" && <p className="mt-1 text-xs font-semibold text-leaf-deep">Sent to Zoho as a draft PO</p>}
    </div>
  );
}

function OrderCell({ row }: { row: DashboardRow }) {
  const text = orderText(row.flag, row.recommended_qty);
  return /^\d+$/.test(text) ? <span className="num text-[22px] font-medium">{text}</span> : <span className="text-[14px] font-semibold text-ink-soft">{text}</span>;
}

const shortDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: iso.length === 10 ? "UTC" : "Asia/Kolkata" });

/** For stockouts: how long the stock lasts, and a warning when the open PO would land too late. */
function StockTiming({ row, stockAsOf }: { row: DashboardRow; stockAsOf: string }) {
  if (row.flag !== "STOCKOUT_RISK" || !stockAsOf) return null;
  const days = daysOfStockLeft({ effectiveStock: row.effective_stock, avg12: (row.signals.avg12 as number | null | undefined) ?? null, festival: Boolean(row.signals.isFestivalMonth), rules: rulesFromSignals(row.signals) });
  if (days === null) return null;
  const check = runOutCheck({ stockAsOf, daysLeft: days, arrivals: row.open_po_arrivals });
  return (
    <>
      <p className="mt-1.5 text-[12.5px] font-semibold text-tomato">About {daysText(days)} of stock left</p>
      <p className="text-[12px] text-ink-soft">Runs out around {shortDate(check.runsOutOn)}, going by the {shortDate(stockAsOf)} stock count</p>
      {check.lateArrival && <p className="mt-1 text-[12px] font-semibold text-tomato">Open PO arrives {shortDate(check.lateArrival)}, after that.</p>}
    </>
  );
}

/** What happened to this SKU in earlier runs, so a repeat flag or an unissued draft is not missed. */
function CarryNotes({ row }: { row: DashboardRow }) {
  const { streak, lastDecision, draftsNotCounted } = row.carry;
  if (streak < 2 && !lastDecision && draftsNotCounted.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 border-l-2 border-mint-deep pl-2.5 text-[12.5px] leading-snug text-ink-soft">
      {streak >= 2 && <li>Flagged the same way in {streak} runs in a row.</li>}
      {lastDecision && (
        <li>
          Last decision: {lastDecision.decided_by} {decisionText(lastDecision.action, lastDecision.final_qty).toLowerCase()} on {shortDate(lastDecision.decided_at)}
          {lastDecision.reason ? <> &ldquo;{lastDecision.reason}&rdquo;</> : null}.
        </li>
      )}
      {draftsNotCounted.map((d) => (
        <li key={d.externalId} className="font-semibold text-ink">
          {d.externalId} for {d.quantity} units went to Zoho on {shortDate(d.createdAt)} and is not counted as stock yet.
        </li>
      ))}
    </ul>
  );
}

/** The arithmetic behind the line, folded away until asked for. */
function Working({ row }: { row: DashboardRow }) {
  const s = row.signals;
  const steps = workingSteps({
    flag: row.flag,
    unitsOnHand: (s.unitsOnHand as number | null | undefined) ?? null,
    openPoUnits: (s.openPoUnits as number | null | undefined) ?? null,
    effectiveStock: row.effective_stock,
    avg12: (s.avg12 as number | null | undefined) ?? null,
    avg4: (s.avg4 as number | null | undefined) ?? null,
    festival: Boolean(s.isFestivalMonth),
    perishability: row.perishability,
    standardQty: row.standard_qty,
    recommendedQty: row.recommended_qty,
    unitCostInr: row.unit_cost_inr,
    rules: rulesFromSignals(s),
  });
  return (
    <details className="mt-2">
      <summary className="cursor-pointer select-none text-[12.5px] font-bold text-forest underline underline-offset-2">Show the working</summary>
      <dl className="mt-2 space-y-1.5 rounded-xl bg-mint p-3 text-[12.5px] leading-snug">
        {steps.map((step) => (
          <div key={step.label}>
            <dt className="font-bold text-forest">{step.label}</dt>
            <dd className="num text-ink">{step.text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function LedgerRow({ row, canDecide, stockAsOf }: { row: DashboardRow; canDecide: boolean; stockAsOf: string }) {
  const hasSignals = Boolean(row.signals.shortHistory || row.signals.recentDrop || row.signals.oneWeekSpike);
  const tone = FLAG_TONES[row.flag]?.ink;
  return (
    <tr>
      <td className="min-w-44">
        <p className="font-semibold leading-snug">{row.sku_name.replace(/^Freshroots /, "")}</p>
        <p className="num mt-0.5 text-[12px] text-ink-soft">{row.sku_id}</p>
      </td>
      <td>
        <div className="flex flex-col items-start gap-1.5">
          <FlagBadge flag={row.flag} />
          <EdgeBadge type={row.edge_case_type} hasSignals={hasSignals} />
        </div>
      </td>
      <td className="whitespace-nowrap text-right">
        <OrderCell row={row} />
        {row.exposure_inr > 0 && <p className="num mt-0.5 text-[12px] text-tomato">{rupees(row.exposure_inr)} at risk</p>}
      </td>
      <td>
        <p className="num text-[15px] font-medium">{row.weeks_of_cover === null ? <span className="text-ink-faint">n/a</span> : <>{row.weeks_of_cover.toFixed(1)} <span className="font-sans text-[12px] font-normal text-ink-soft">weeks</span></>}</p>
        <div className="mt-1">
          <Sparkline values={trend(row)} color={tone} />
        </div>
        <StockTiming row={row} stockAsOf={stockAsOf} />
      </td>
      <td className="min-w-52 max-w-sm">
        <p className="leading-snug">{row.reason ?? <span className="italic text-ink-faint">No explanation yet.</span>}</p>
        {row.evidence && <p className="mt-1.5 text-[13px] leading-snug text-ink-soft">{row.evidence}</p>}
        {row.explanation_source === "llm" && <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-faint">AI note</p>}
        {needsReview(row) && <CarryNotes row={row} />}
        <Working row={row} />
      </td>
      <td>{needsReview(row) ? <DecisionStamp row={row} canDecide={canDecide} /> : <span className="text-sm italic text-ink-faint">No approval needed</span>}</td>
    </tr>
  );
}

const COLUMNS: { label: string; right?: boolean }[] = [
  { label: "Product" },
  { label: "Rule outcome" },
  { label: "Order", right: true },
  { label: "Cover" },
  { label: "Why" },
  { label: "Decision" },
];

function Ledger({ rows, canDecide, stockAsOf }: { rows: DashboardRow[]; canDecide: boolean; stockAsOf: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="ledger min-w-[860px]">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.label} className={c.right ? "!text-right" : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <LedgerRow key={row.id} row={row} canDecide={canDecide} stockAsOf={stockAsOf} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function href(filter: FilterId, q: string) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("show", filter);
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

function FilterBar({ active, counts, q }: { active: FilterId; counts: Record<FilterId, number>; q: string }) {
  return (
    <nav aria-label="Filter lines" className="flex flex-wrap gap-2">
      {FILTERS.map((f) => {
        const on = f.id === active;
        return (
          <Link key={f.id} href={href(f.id, q)} aria-current={on ? "true" : undefined} className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold ${on ? "bg-forest text-lime" : "bg-mint text-forest hover:bg-mint-deep"}`}>
            {f.label} <span className="num ml-1 opacity-70">{counts[f.id]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function TitleRow({ data, canRun }: { data: Dashboard; canRun: boolean }) {
  const { shownRun, latestRun } = data;
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="max-w-2xl">
        <h1 className="text-[32px] sm:text-[38px]">Reorder recommendations</h1>
        {shownRun ? (
          <p className="mt-1.5 text-ink-soft">
            Last run <span className="font-semibold text-ink">{when(shownRun.started_at)}</span> by {shownRun.triggered_by.replace("manual:", "").replace("cron", "the schedule").replace("cli", "the command line")}. Stock counted on{" "}
            <span className="num">{data.stockAsOf ?? shownRun.as_of_date}</span>.
          </p>
        ) : (
          <p className="mt-1.5 text-ink-soft">No completed run yet. Press Run now to create the first one.</p>
        )}
        {latestRun && latestRun.status !== "completed" && (
          <p className="mt-2 rounded-xl bg-tomato-wash px-3 py-2 text-sm font-semibold text-tomato">
            The latest attempt ({when(latestRun.started_at)}) was {latestRun.status}: {latestRun.error}
          </p>
        )}
      </div>
      {canRun ? <RunNowButton /> : <p className="max-w-xs text-sm italic text-ink-soft sm:text-right">Only Raghav starts a run. The schedule also runs it every Monday and Thursday.</p>}
    </div>
  );
}

const matches = (row: DashboardRow, q: string) => !q || row.sku_id.toLowerCase().includes(q) || row.sku_name.toLowerCase().includes(q);

export default async function Home({ searchParams }: { searchParams: Promise<{ show?: string; q?: string }> }) {
  const params = await searchParams;
  const filter = parseFilter(params.show);
  const q = (params.q ?? "").trim();

  let data: Dashboard;
  let rules: RulesView;
  try {
    [data, rules] = await Promise.all([loadDashboard(getDb()), loadRules(getDb())]);
  } catch (err) {
    return (
      <>
        <h1 className="text-[32px]">Reorder recommendations</h1>
        <p role="alert" className="mt-4 rounded-2xl bg-tomato-wash p-4 text-sm">
          <span className="font-semibold">Could not load the database.</span> Check DATABASE_URL in .env.local and that `npm run migrate` has run.
          <span className="num mt-1 block text-xs text-ink-soft">{err instanceof Error ? err.message : String(err)}</span>
        </p>
      </>
    );
  }

  const monitor = await getMonitorView();
  const actor = await getActingAs();
  const sorted = sortForReview(data.rows);
  const review = sorted.filter(needsReview);
  const quiet = sorted.filter((r) => !needsReview(r));
  if (actor === "Deepa" && data.shownRun && monitor) {
    const run = data.shownRun;
    const runLabel = `Last run ${when(run.started_at)} by ${run.triggered_by.replace("manual:", "").replace("cron", "the schedule").replace("cli", "the command line")}.`;
    return <OversightPage rows={review} monitor={monitor} festivalMonths={data.festivalMonths} runLabel={runLabel} rules={rules} />;
  }

  const needle = q.toLowerCase();
  const shown = applyFilter(review, filter).filter((r) => matches(r, needle));
  const shownQuiet = quiet.filter((r) => matches(r, needle));
  const canDecide = can(actor, "decide");
  const readyRows = review.filter((r) => r.status === "approved" && r.decision && r.decision.final_qty > 0);
  const readyToPush = readyRows.length;
  const readyValue = readyRows.reduce((sum, r) => sum + (purchaseValueInr(r.decision!.final_qty, r.unit_cost_inr) ?? 0), 0);
  const stockAsOf = data.stockAsOf ?? data.shownRun?.as_of_date ?? "";
  const zohoMode = process.env.ZOHO_MODE?.trim().toLowerCase() === "live" ? "live" : "mock";
  const salesTotals = salesTrend(data.rows);

  return (
    <div className="flex flex-col gap-6">
      <TitleRow data={data} canRun={can(actor, "run")} />

      {data.shownRun && (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_228px]">
            <div className="flex min-w-0 flex-col gap-4">
              <StatCards rows={review} />

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
                {salesTotals ? <WeeklyChart trend={salesTotals} /> : <div className="card-mint p-5 text-sm text-ink-soft">Not enough weeks of sales to draw a trend yet.</div>}
                <div className="card-lime p-5 text-forest-deep">
                  {can(actor, "push") ? (
                    <PushButton readyLines={readyToPush} mode={zohoMode} blocked={Boolean(monitor?.killSwitch.active)} purchaseValue={readyValue > 0 ? rupees(readyValue) : undefined} />
                  ) : (
                    <div>
                      <p className="font-display text-[44px] font-semibold leading-none">
                        <span className="num">{readyToPush}</span>
                      </p>
                      <p className="mt-1 text-[15px] font-semibold">approved {readyToPush === 1 ? "line" : "lines"} ready for Zoho</p>
                      {readyValue > 0 && (
                        <p className="mt-1 text-[13px] font-semibold">
                          Purchase value <span className="num">{rupees(readyValue)}</span> at unit cost
                        </p>
                      )}
                      <p className="mt-1.5 text-[13px] text-forest/80">Raghav sends approved lines to Zoho as draft purchase orders.</p>
                    </div>
                  )}
                </div>
              </div>

              {monitor && <MonitorStrip monitor={monitor} />}
            </div>

            <div className="hidden xl:block">
              <UpcomingRuns festivalMonths={data.festivalMonths} />
            </div>
          </div>

          <section className="card p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[22px]">{canDecide ? "For you to decide" : "Lines Raghav is deciding"}</h2>
                {q && (
                  <p className="mt-0.5 text-sm text-ink-soft">
                    Showing matches for <span className="font-semibold text-ink">&ldquo;{q}&rdquo;</span>.{" "}
                    <Link href={href(filter, "")} className="font-semibold text-forest underline underline-offset-2">
                      Clear search
                    </Link>
                  </p>
                )}
              </div>
              <FilterBar active={filter} counts={countByFilter(review)} q={q} />
            </div>
            <div className="mt-4">
              {shown.length > 0 ? <Ledger rows={shown} canDecide={canDecide} stockAsOf={stockAsOf} /> : <p className="rounded-2xl bg-mint py-8 text-center text-ink-soft">Nothing matches.</p>}
            </div>
          </section>

          <details className="card group p-5">
            <summary className="cursor-pointer select-none font-display text-lg font-semibold">
              {shownQuiet.length} SKUs are fine and need no approval
              <span className="ml-2 text-sm font-normal text-ink-soft group-open:hidden">(show)</span>
            </summary>
            {shownQuiet.length > 0 && (
              <div className="mt-3">
                <Ledger rows={shownQuiet} canDecide={canDecide} stockAsOf={stockAsOf} />
              </div>
            )}
          </details>
        </>
      )}

      <RulesPanel rules={rules} canEdit={can(actor, "edit_rules")} />
    </div>
  );
}
