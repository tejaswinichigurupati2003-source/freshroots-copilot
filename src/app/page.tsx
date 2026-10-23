import Link from "next/link";
import type { ReactNode } from "react";
import { Banners, Masthead } from "@/components/banners";
import { EdgeBadge, FLAG_TONES, FlagBadge } from "@/components/badges";
import { OversightPanel } from "@/components/oversight";
import { PushButton } from "@/components/push-button";
import { RowActions } from "@/components/row-actions";
import { RunNowButton } from "@/components/run-now-button";
import { Sparkline } from "@/components/sparkline";
import { formatRun, nextScheduledRun } from "@/lib/ingest/schedule";
import { Summary } from "@/components/summary";
import { rupees } from "@/lib/approval/exposure";
import { applyFilter, countByFilter, FILTERS, parseFilter, type FilterId } from "@/lib/approval/filters";
import { decisionText, orderText } from "@/lib/approval/labels";
import { needsReview, sortForReview } from "@/lib/approval/review";
import { can } from "@/lib/approval/roles";
import { getDb } from "@/lib/db/client";
import { loadDashboard, type Dashboard, type DashboardRow } from "@/lib/db/dashboard";
import { loadMonitor, type MonitorView } from "@/lib/db/monitor-store";
import { getThresholds } from "@/lib/monitor/types";
import { getActingAs } from "@/lib/session";

export const dynamic = "force-dynamic";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";

function trend(row: DashboardRow): number[] {
  return ((row.signals.recentWeeks ?? []) as { units: number }[]).map((w) => w.units);
}

/** A rubber stamp for the decision, tilted a little the way a real one lands. */
function DecisionStamp({ row, canDecide }: { row: DashboardRow; canDecide: boolean }) {
  const d = row.decision;
  if (!d) return canDecide ? <RowActions recommendationId={row.id} recommendedQty={row.recommended_qty} /> : <span className="text-sm italic text-ink-faint">Waiting for Raghav</span>;

  const rejected = d.action === "rejected";
  const ink = rejected ? "var(--color-tomato)" : "var(--color-leaf)";
  return (
    <div className="min-w-56">
      <div className="inline-block border-2 px-2.5 py-1 font-bold uppercase tracking-wide" style={{ color: ink, borderColor: ink, fontSize: 12 }}>
        {decisionText(d.action, d.final_qty)}
      </div>
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
  const isNumber = /^\d+$/.test(text);
  return isNumber ? <span className="num text-[22px] font-medium">{text}</span> : <span className="font-display text-[15px] italic text-ink-soft">{text}</span>;
}

function LedgerRow({ row, canDecide }: { row: DashboardRow; canDecide: boolean }) {
  const hasSignals = Boolean(row.signals.shortHistory || row.signals.recentDrop || row.signals.oneWeekSpike);
  const tone = FLAG_TONES[row.flag]?.ink;
  return (
    <tr>
      <td className="min-w-44">
        <p className="num text-[13px] font-medium">{row.sku_id}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{row.sku_name.replace(/^Freshroots /, "")}</p>
      </td>
      <td>
        <div className="flex flex-col items-start gap-1.5">
          <FlagBadge flag={row.flag} />
          <EdgeBadge type={row.edge_case_type} hasSignals={hasSignals} />
        </div>
      </td>
      <td className="whitespace-nowrap text-right">
        <OrderCell row={row} />
      </td>
      <td className="num text-right">{row.weeks_of_cover === null ? <span className="text-ink-faint">n/a</span> : row.weeks_of_cover.toFixed(1)}</td>
      <td>
        <Sparkline values={trend(row)} color={tone} />
      </td>
      <td className="num text-right">{row.exposure_inr > 0 ? rupees(row.exposure_inr) : <span className="text-ink-faint">-</span>}</td>
      <td className="min-w-72 max-w-sm">
        <p className="leading-snug">{row.reason ?? <span className="italic text-ink-faint">No explanation yet.</span>}</p>
        {row.evidence && <p className="mt-1.5 border-l-2 border-rule-strong pl-2 text-[13px] italic leading-snug text-ink-soft">{row.evidence}</p>}
        {row.explanation_source === "llm" && <p className="mt-1.5 text-[11px] uppercase tracking-wider text-ink-faint">AI note</p>}
      </td>
      <td>{needsReview(row) ? <DecisionStamp row={row} canDecide={canDecide} /> : <span className="text-sm italic text-ink-faint">No approval needed</span>}</td>
    </tr>
  );
}

const COLUMNS: { label: string; right?: boolean }[] = [
  { label: "SKU" },
  { label: "Rule outcome" },
  { label: "Order", right: true },
  { label: "Weeks cover", right: true },
  { label: "12 weeks" },
  { label: "At risk", right: true },
  { label: "Why" },
  { label: "Decision" },
];

function Ledger({ rows, canDecide }: { rows: DashboardRow[]; canDecide: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="ledger min-w-[1200px]">
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
            <LedgerRow key={row.id} row={row} canDecide={canDecide} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilterBar({ active, counts }: { active: FilterId; counts: Record<FilterId, number> }) {
  return (
    <nav aria-label="Filter lines" className="flex flex-wrap gap-2">
      {FILTERS.map((f) => {
        const on = f.id === active;
        return (
          <Link
            key={f.id}
            href={f.id === "all" ? "/" : `/?show=${f.id}`}
            aria-current={on ? "true" : undefined}
            className="border px-3 py-1 text-[13px] font-semibold"
            style={on ? { background: "var(--color-ink)", color: "var(--color-paper)", borderColor: "var(--color-ink)" } : { borderColor: "var(--color-rule-strong)", color: "var(--color-ink-soft)" }}
          >
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
        <p className="eyebrow">Next scheduled run {formatRun(nextScheduledRun(new Date()))}</p>
        <h1 className="mt-1 text-[40px] sm:text-[46px]">Reorder recommendations</h1>
        {shownRun ? (
          <p className="mt-2 text-ink-soft">
            Last run <span className="font-semibold text-ink">{when(shownRun.started_at)}</span> by {shownRun.triggered_by.replace("manual:", "").replace("cron", "the schedule").replace("cli", "the command line")}. Stock counted on{" "}
            <span className="num">{data.stockAsOf ?? shownRun.as_of_date}</span>.
          </p>
        ) : (
          <p className="mt-2 text-ink-soft">No completed run yet. Press Run now to create the first one.</p>
        )}
        {latestRun && latestRun.status !== "completed" && (
          <p className="mt-2 border-l-4 border-tomato pl-3 text-sm font-semibold text-tomato">
            The latest attempt ({when(latestRun.started_at)}) was {latestRun.status}: {latestRun.error}
          </p>
        )}
      </div>
      {canRun ? <RunNowButton /> : <p className="max-w-xs text-sm italic text-ink-soft sm:text-right">Only Raghav starts a run. The schedule also runs it every Monday and Thursday.</p>}
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex max-w-[1280px] flex-col gap-7 px-5 pb-20 pt-5 sm:px-8">{children}</main>;
}

export default async function Home({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const filter = parseFilter((await searchParams).show);

  let data: Dashboard;
  let monitor: MonitorView;
  try {
    const db = getDb();
    [data, monitor] = await Promise.all([loadDashboard(db), loadMonitor(db, getThresholds())]);
  } catch (err) {
    return (
      <Shell>
        <h1 className="text-[40px]">Reorder recommendations</h1>
        <p role="alert" className="border-l-4 border-tomato bg-tomato-wash p-4 text-sm">
          <span className="font-semibold">Could not load the database.</span> Check DATABASE_URL in .env.local and that `npm run migrate` has run.
          <span className="num mt-1 block text-xs text-ink-soft">{err instanceof Error ? err.message : String(err)}</span>
        </p>
      </Shell>
    );
  }

  const actor = await getActingAs();
  const sorted = sortForReview(data.rows);
  const review = sorted.filter(needsReview);
  const quiet = sorted.filter((r) => !needsReview(r));
  const shown = applyFilter(review, filter);
  const canDecide = can(actor, "decide");
  const readyToPush = review.filter((r) => r.status === "approved" && r.decision && r.decision.final_qty > 0).length;
  const zohoMode = process.env.ZOHO_MODE?.trim().toLowerCase() === "live" ? "live" : "mock";

  return (
    <Shell>
      <Banners monitor={monitor} />
      <Masthead current="dashboard" />
      <TitleRow data={data} canRun={can(actor, "run")} />

      {data.shownRun && (
        <>
          <Summary rows={review} />

          {actor === "Deepa" && <OversightPanel reviewRows={review} monitor={monitor} />}

          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-[26px]">{canDecide ? "For you to decide" : "Lines Raghav is deciding"}</h2>
              <FilterBar active={filter} counts={countByFilter(review)} />
            </div>
            {shown.length > 0 ? <Ledger rows={shown} canDecide={canDecide} /> : <p className="border-y border-rule py-8 text-center italic text-ink-soft">Nothing matches this filter.</p>}
          </section>

          {can(actor, "push") && (
            <section className="panel p-5">
              <PushButton readyLines={readyToPush} mode={zohoMode} blocked={monitor.killSwitch.active} />
            </section>
          )}

          <details className="group">
            <summary className="cursor-pointer select-none border-y border-rule-strong py-3 font-display text-lg">
              {quiet.length} SKUs are fine and need no approval
              <span className="ml-2 text-sm text-ink-soft group-open:hidden">(show)</span>
            </summary>
            {quiet.length > 0 && <Ledger rows={quiet} canDecide={canDecide} />}
          </details>
        </>
      )}
    </Shell>
  );
}
