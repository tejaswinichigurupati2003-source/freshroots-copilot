import Link from "next/link";
import type { ReactNode } from "react";
import { finalQtyText, orderText } from "@/lib/approval/labels";
import type { DashboardRow } from "@/lib/db/dashboard";
import type { MonitorView } from "@/lib/db/monitor-store";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

const CALL: Record<string, string> = { approved: "Approved", edited: "Changed quantity", rejected: "Rejected" };

function Figure({ label, value, note, tone }: { label: string; value: ReactNode; note?: string; tone?: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-display text-[30px] leading-none" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      {note && <p className="mt-1.5 text-[13px] text-ink-soft">{note}</p>}
    </div>
  );
}

/** Deepa's view: how Raghav is deciding and where loss stands. Read only. */
export function OversightPanel({ reviewRows, monitor }: { reviewRows: DashboardRow[]; monitor: MonitorView }) {
  const decided = reviewRows.filter((r) => r.decision);
  const waiting = reviewRows.length - decided.length;
  const rejected = decided.filter((r) => r.decision?.action === "rejected").length;
  const changed = decided.filter((r) => r.decision?.action === "edited").length;
  const { rejection, latestActual, killSwitch, thresholds } = monitor;

  const lossTone = latestActual?.level === "stop" ? "var(--color-tomato)" : latestActual?.level === "warn" ? "var(--color-turmeric)" : undefined;

  return (
    <section className="panel flex flex-col gap-5 p-5" aria-label="Oversight for Deepa">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Read only</p>
          <h2 className="mt-1 text-[26px]">Oversight</h2>
        </div>
        <Link href="/monitor" className="btn">
          Enter losses or resume the kill switch
        </Link>
      </div>

      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Waiting on Raghav" value={<span className="num">{waiting}</span>} note={`of ${reviewRows.length} lines in this run`} tone={waiting === 0 ? "var(--color-leaf)" : undefined} />
        <Figure
          label="Raghav's calls so far"
          value={
            <>
              <span className="num">{decided.length - rejected}</span> <span className="text-[18px] text-ink-soft">yes</span> <span className="num">{rejected}</span> <span className="text-[18px] text-ink-soft">no</span>
            </>
          }
          note={changed > 0 ? `${changed} with a changed quantity` : "No quantities changed"}
        />
        <Figure
          label="Rejection rate, 30 days"
          value={rejection.rate === null ? <span className="text-[22px] italic text-ink-soft">not measured</span> : <span className="num">{Math.round(rejection.rate * 100)}%</span>}
          note={rejection.rate === null ? `Needs ${monitor.minLines} decided lines, has ${rejection.decided}` : "Healthy is 15% to 30%. Warning above 50%."}
          tone={rejection.warning ? "var(--color-turmeric)" : undefined}
        />
        <Figure
          label="Loss this quarter"
          value={latestActual ? <span className="num">{Number(latestActual.total_loss_lakh)} lakh</span> : <span className="text-[22px] italic text-ink-soft">none entered</span>}
          note={`Baseline ${thresholds.BASELINE_LOSS_LAKH}. Warn above ${thresholds.LOSS_WARN_LAKH}. Stop above ${thresholds.LOSS_STOP_LAKH}.`}
          tone={lossTone}
        />
      </div>

      <p className="border-l-4 py-1.5 pl-3 text-sm" style={{ borderColor: killSwitch.active ? "var(--color-tomato)" : "var(--color-leaf)", background: killSwitch.active ? "var(--color-tomato-wash)" : "var(--color-leaf-wash)" }}>
        Kill switch: <span className="font-bold">{killSwitch.active ? "ON" : "off"}</span>
        {killSwitch.active ? `. ${killSwitch.reason ?? ""}` : ". Runs and pushes are allowed."}
      </p>

      <div className="overflow-x-auto">
        <table className="ledger min-w-[640px]">
          <thead>
            <tr>
              <th>SKU</th>
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
                  <td className="!py-2.5">
                    <span className="num text-[13px] font-medium">{r.sku_id}</span> <span className="text-[13px] text-ink-soft">{r.sku_name.replace(/^Freshroots /, "")}</span>
                  </td>
                  <td className="!py-2.5 font-semibold" style={{ color: r.decision?.action === "rejected" ? "var(--color-tomato)" : "var(--color-leaf-deep)" }}>
                    {CALL[r.decision?.action ?? ""] ?? r.decision?.action}
                  </td>
                  <td className="num !py-2.5 text-right text-[13px]">{orderText(r.flag, r.recommended_qty)}</td>
                  <td className="num !py-2.5 text-right text-[13px]">{r.decision?.action === "rejected" ? "None" : finalQtyText(r.decision?.final_qty ?? 0)}</td>
                  <td className="!py-2.5 italic text-ink-soft">{r.decision?.reason ?? ""}</td>
                  <td className="num whitespace-nowrap !py-2.5 text-[12px] text-ink-soft">{r.decision ? when(r.decision.decided_at) : ""}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
