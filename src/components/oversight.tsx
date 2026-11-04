import Link from "next/link";
import type { ReactNode } from "react";
import { rupees } from "@/lib/approval/exposure";
import { finalQtyText, orderText } from "@/lib/approval/labels";
import { daysOfStockLeft, daysText } from "@/lib/approval/stockout-timing";
import type { DashboardRow } from "@/lib/db/dashboard";
import type { MonitorView } from "@/lib/db/monitor-store";
import type { RulesView } from "@/lib/db/rules-store";
import { rulesFromSignals } from "@/lib/rules/settings";
import { FlagBadge } from "./badges";
import { MonitorStrip } from "./monitor-strip";
import { RulesPanel } from "./rules-panel";
import { StatCards } from "./stat-cards";
import { UpcomingRuns } from "./upcoming-runs";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

const CALL: Record<string, string> = { approved: "Approved", edited: "Changed quantity", rejected: "Rejected" };

function Figure({ label, value, note, tone }: { label: string; value: ReactNode; note?: string; tone?: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-display text-[28px] font-semibold leading-none" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      {note && <p className="mt-1.5 text-[13px] text-ink-soft">{note}</p>}
    </div>
  );
}

/** Lines Raghav has not decided yet, most urgent first (the rows arrive already sorted). */
function WaitingList({ rows }: { rows: DashboardRow[] }) {
  const waiting = rows.filter((r) => !r.decision);
  return (
    <section className="card p-5" aria-label="Waiting on Raghav">
      <h2 className="text-[22px]">Still waiting on Raghav</h2>
      <p className="mt-0.5 text-sm text-ink-soft">Most urgent first. Only Raghav can approve, change or reject these.</p>
      <div className="mt-4 overflow-x-auto">
        {waiting.length === 0 ? (
          <p className="rounded-2xl bg-mint py-8 text-center text-ink-soft">Every line in this run has a decision.</p>
        ) : (
          <table className="ledger min-w-[560px]">
            <thead>
              <tr>
                <th>Product</th>
                <th>Rule outcome</th>
                <th className="!text-right">Recommended</th>
                <th className="!text-right">Stock left</th>
                <th className="!text-right">Rupees at risk</th>
              </tr>
            </thead>
            <tbody>
              {waiting.map((r) => {
                const days = r.flag === "STOCKOUT_RISK" ? daysOfStockLeft({ effectiveStock: r.effective_stock, avg12: (r.signals.avg12 as number | null | undefined) ?? null, festival: Boolean(r.signals.isFestivalMonth), rules: rulesFromSignals(r.signals) }) : null;
                return (
                  <tr key={r.id}>
                    <td className="!py-3">
                      <span className="font-semibold">{r.sku_name.replace(/^Freshroots /, "")}</span> <span className="num text-[12px] text-ink-soft">{r.sku_id}</span>
                    </td>
                    <td className="!py-3">
                      <FlagBadge flag={r.flag} />
                    </td>
                    <td className="num !py-3 text-right text-[13px]">{orderText(r.flag, r.recommended_qty)}</td>
                    <td className="num !py-3 text-right text-[13px]">{days === null ? "" : daysText(days)}</td>
                    <td className="num !py-3 text-right text-[13px]">{r.exposure_inr > 0 ? rupees(r.exposure_inr) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/** Deepa's whole page: how the run is going, how Raghav is deciding, where loss and the kill switch stand. */
export function OversightPage({ rows, monitor, festivalMonths, runLabel, rules }: { rows: DashboardRow[]; monitor: MonitorView; festivalMonths: string[]; runLabel: string; rules: RulesView }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="max-w-2xl">
          <h1 className="text-[32px] sm:text-[38px]">Oversight</h1>
          <p className="mt-1.5 text-ink-soft">
            {runLabel} You enter the quarter&rsquo;s loss and can resume the kill switch. Raghav makes the order decisions.
          </p>
        </div>
        <Link href="/monitor" className="btn btn-primary">
          Enter losses or resume the kill switch
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_228px]">
        <div className="flex min-w-0 flex-col gap-4">
          <MonitorStrip monitor={monitor} />
          <StatCards rows={rows} />
        </div>
        <div className="hidden xl:block">
          <UpcomingRuns festivalMonths={festivalMonths} />
        </div>
      </div>

      <OversightPanel reviewRows={rows} monitor={monitor} />
      <WaitingList rows={rows} />
      <RulesPanel rules={rules} canEdit />
    </div>
  );
}

/** How Raghav is deciding and where loss stands. Read only. */
export function OversightPanel({ reviewRows, monitor }: { reviewRows: DashboardRow[]; monitor: MonitorView }) {
  const decided = reviewRows.filter((r) => r.decision);
  const waiting = reviewRows.length - decided.length;
  const rejected = decided.filter((r) => r.decision?.action === "rejected").length;
  const changed = decided.filter((r) => r.decision?.action === "edited").length;
  const { rejection, latestActual, thresholds } = monitor;

  const lossTone = latestActual?.level === "stop" ? "var(--color-tomato)" : latestActual?.level === "warn" ? "var(--color-turmeric)" : undefined;

  return (
    <section className="card flex flex-col gap-5 p-5" aria-label="Oversight for Deepa">
      <div>
        <p className="eyebrow">Read only</p>
        <h2 className="mt-1 text-[22px]">Raghav&rsquo;s decisions</h2>
      </div>

      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Waiting on Raghav" value={<span className="num">{waiting}</span>} note={`of ${reviewRows.length} lines in this run`} tone={waiting === 0 ? "var(--color-leaf)" : undefined} />
        <Figure
          label="Raghav's calls so far"
          value={
            <>
              <span className="num">{decided.length - rejected}</span> <span className="text-[16px] font-medium text-ink-soft">yes</span> <span className="num">{rejected}</span> <span className="text-[16px] font-medium text-ink-soft">no</span>
            </>
          }
          note={changed > 0 ? `${changed} with a changed quantity` : "No quantities changed"}
        />
        <Figure
          label="Rejection rate, 30 days"
          value={rejection.rate === null ? <span className="text-[20px] font-medium italic text-ink-soft">not measured</span> : <span className="num">{Math.round(rejection.rate * 100)}%</span>}
          note={rejection.rate === null ? `Needs ${monitor.minLines} decided lines, has ${rejection.decided}` : "Healthy is 15% to 30%. Warning above 50%."}
          tone={rejection.warning ? "var(--color-turmeric)" : undefined}
        />
        <Figure
          label="Loss this quarter"
          value={latestActual ? <span className="num">{Number(latestActual.total_loss_lakh)} lakh</span> : <span className="text-[20px] font-medium italic text-ink-soft">none entered</span>}
          note={`Baseline ${thresholds.BASELINE_LOSS_LAKH}. Warn above ${thresholds.LOSS_WARN_LAKH}. Stop above ${thresholds.LOSS_STOP_LAKH}.`}
          tone={lossTone}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="ledger min-w-[640px]">
          <thead>
            <tr>
              <th>Product</th>
              <th>Raghav&rsquo;s call</th>
              <th className="!text-right">Recommended</th>
              <th className="!text-right">Final</th>
              <th>Reason</th>
              <th>When (IST)</th>
            </tr>
          </thead>
          <tbody>
            {decided.length === 0 && (
              <tr>
                <td colSpan={6} className="italic text-ink-soft">
                  No decisions yet in this run.
                </td>
              </tr>
            )}
            {[...decided]
              .sort((a, b) => (b.decision?.decided_at ?? "").localeCompare(a.decision?.decided_at ?? ""))
              .map((r) => (
                <tr key={r.id}>
                  <td className="!py-3">
                    <span className="font-semibold">{r.sku_name.replace(/^Freshroots /, "")}</span> <span className="num text-[12px] text-ink-soft">{r.sku_id}</span>
                  </td>
                  <td className="!py-3 font-semibold" style={{ color: r.decision?.action === "rejected" ? "var(--color-tomato)" : "var(--color-leaf-deep)" }}>
                    {CALL[r.decision?.action ?? ""] ?? r.decision?.action}
                  </td>
                  <td className="num !py-3 text-right text-[13px]">{orderText(r.flag, r.recommended_qty)}</td>
                  <td className="num !py-3 text-right text-[13px]">{r.decision?.action === "rejected" ? "None" : finalQtyText(r.decision?.final_qty ?? 0)}</td>
                  <td className="!py-3 italic text-ink-soft">{r.decision?.reason ?? ""}</td>
                  <td className="num whitespace-nowrap !py-3 text-[12px] text-ink-soft">{r.decision ? when(r.decision.decided_at) : ""}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
