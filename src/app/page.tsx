import { Banners, NavLinks } from "@/components/banners";
import { EdgeBadge, FlagBadge } from "@/components/badges";
import { OversightPanel } from "@/components/oversight";
import { PushButton } from "@/components/push-button";
import { RowActions } from "@/components/row-actions";
import { RunNowButton } from "@/components/run-now-button";
import { Sparkline } from "@/components/sparkline";
import { decisionText, orderText } from "@/lib/approval/labels";
import { can } from "@/lib/approval/roles";
import { needsReview, sortForReview } from "@/lib/approval/review";
import { getDb } from "@/lib/db/client";
import { loadMonitor, type MonitorView } from "@/lib/db/monitor-store";
import { getThresholds } from "@/lib/monitor/types";
import { loadDashboard, type Dashboard, type DashboardRow } from "@/lib/db/dashboard";
import { getActingAs } from "@/lib/session";

export const dynamic = "force-dynamic";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";

function trend(row: DashboardRow): number[] {
  const weeks = (row.signals.recentWeeks ?? []) as { units: number }[];
  return weeks.map((w) => w.units);
}

function DecisionCell({ row, canDecide }: { row: DashboardRow; canDecide: boolean }) {
  if (row.decision) {
    const d = row.decision;
    return (
      <div className="min-w-56 text-xs text-slate-700">
        <p className="font-medium">
          {decisionText(d.action, d.final_qty)}
        </p>
        <p>
          by {d.decided_by}, {when(d.decided_at)}
        </p>
        {d.reason && <p className="mt-0.5 italic">&ldquo;{d.reason}&rdquo;</p>}
        {row.status === "pushed" && <p className="mt-0.5 font-medium text-emerald-800">Sent to Zoho as a draft PO</p>}
        {canDecide && (
          <div className="mt-2 flex gap-1.5 opacity-50">
            {["Approve", "Edit quantity", "Reject"].map((label) => (
              <button key={label} disabled className="rounded-md border border-slate-300 px-2.5 py-1 text-xs">
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (!canDecide) return <span className="text-xs text-slate-500">Waiting for Raghav</span>;
  return <RowActions recommendationId={row.id} recommendedQty={row.recommended_qty} />;
}

function RecommendationRow({ row, canDecide }: { row: DashboardRow; canDecide: boolean }) {
  const hasSignals = Boolean(row.signals.shortHistory || row.signals.recentDrop || row.signals.oneWeekSpike);
  return (
    <tr className="border-t border-slate-200 align-top">
      <td className="px-3 py-3">
        <p className="font-medium">{row.sku_id}</p>
        <p className="text-xs text-slate-600">{row.sku_name}</p>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col items-start gap-1">
          <FlagBadge flag={row.flag} />
          <EdgeBadge type={row.edge_case_type} hasSignals={hasSignals} />
        </div>
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{orderText(row.flag, row.recommended_qty)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{row.weeks_of_cover === null ? "n/a" : row.weeks_of_cover.toFixed(1)}</td>
      <td className="px-3 py-3">
        <Sparkline values={trend(row)} />
      </td>
      <td className="max-w-md px-3 py-3 text-sm">
        <p>{row.reason ?? "No explanation yet."}</p>
        {row.evidence && <p className="mt-1 text-xs text-slate-600">{row.evidence}</p>}
      </td>
      <td className="px-3 py-3">
        {needsReview(row) ? <DecisionCell row={row} canDecide={canDecide} /> : <span className="text-xs text-slate-500">No approval needed</span>}
      </td>
    </tr>
  );
}

const headers = ["SKU", "Flag", "Recommended order", "Weeks of cover", "12-week sales", "Why", "Decision"];

function Table({ rows, canDecide }: { rows: DashboardRow[]; canDecide: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            {headers.map((h, i) => (
              <th key={h} className={`px-3 py-2 font-medium ${i === 2 || i === 3 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <RecommendationRow key={row.id} row={row} canDecide={canDecide} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Header({ data, canRun }: { data: Dashboard; canRun: boolean }) {
  const { shownRun, latestRun, stockAsOf } = data;
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Reorder recommendations</h1>
        <NavLinks current="dashboard" />
        {shownRun ? (
          <p className="mt-1 text-sm text-slate-600">
            Last run {when(shownRun.started_at)} ({shownRun.triggered_by}). Run as of {shownRun.as_of_date}.
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-600">No completed run yet. Press Run now to create the first one.</p>
        )}
        <p className="text-sm text-slate-600">
          Data freshness: stock counted on {stockAsOf ?? "unknown"}.
          {latestRun && latestRun.status !== "completed" && (
            <span className="ml-1 font-medium text-red-700">The latest attempt ({when(latestRun.started_at)}) was {latestRun.status}: {latestRun.error}</span>
          )}
        </p>
      </div>
      {canRun ? <RunNowButton /> : <p className="max-w-xs text-right text-xs text-slate-500">Only Raghav starts a run. Runs also happen on their own every Monday and Thursday.</p>}
    </header>
  );
}

export default async function Home() {
  let data: Dashboard;
  let monitor: MonitorView;
  try {
    const db = getDb();
    [data, monitor] = await Promise.all([loadDashboard(db), loadMonitor(db, getThresholds())]);
  } catch (err) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold">Reorder recommendations</h1>
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Could not load the database. Check DATABASE_URL in .env.local and that `npm run migrate` has run.
          <span className="mt-1 block text-xs">{err instanceof Error ? err.message : String(err)}</span>
        </p>
      </main>
    );
  }

  const actor = await getActingAs();
  const sorted = sortForReview(data.rows);
  const review = sorted.filter(needsReview);
  const quiet = sorted.filter((r) => !needsReview(r));
  const decided = review.filter((r) => r.decision).length;
  const readyToPush = review.filter((r) => r.status === "approved" && r.decision && r.decision.final_qty > 0).length;
  const canDecide = can(actor, "decide");
  const zohoMode = process.env.ZOHO_MODE?.trim().toLowerCase() === "live" ? "live" : "mock";

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <Banners monitor={monitor} />

      <Header data={data} canRun={can(actor, "run")} />

      {data.shownRun && (
        <>
          {actor === "Deepa" && <OversightPanel reviewRows={review} monitor={monitor} />}

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">
              {canDecide ? "Needs your decision" : "Lines Raghav is deciding"}{" "}
              <span className="text-sm font-normal text-slate-600">
                ({decided} of {review.length} decided)
              </span>
            </h2>
            {review.length > 0 ? <Table rows={review} canDecide={canDecide} /> : <p className="text-sm text-slate-600">Nothing needs a decision in this run.</p>}
          </section>

          {can(actor, "push") && (
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <PushButton readyLines={readyToPush} mode={zohoMode} blocked={monitor.killSwitch.active} />
            </section>
          )}

          <details className="rounded-lg border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-medium">
              {quiet.length} SKUs are OK and need no approval
            </summary>
            <div className="mt-3">{quiet.length > 0 && <Table rows={quiet} canDecide={canDecide} />}</div>
          </details>
        </>
      )}
    </main>
  );
}
