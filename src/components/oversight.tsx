import Link from "next/link";
import { finalQtyText, orderText } from "@/lib/approval/labels";
import type { DashboardRow } from "@/lib/db/dashboard";
import type { MonitorView } from "@/lib/db/monitor-store";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

const CALL: Record<string, string> = { approved: "Approved", edited: "Changed quantity", rejected: "Rejected" };

function Card({ label, value, note, tone = "plain" }: { label: string; value: string; note?: string; tone?: "plain" | "warn" | "bad" | "good" }) {
  const tones = { plain: "border-slate-200", warn: "border-amber-300 bg-amber-50", bad: "border-red-300 bg-red-50", good: "border-emerald-300 bg-emerald-50" };
  return (
    <div className={`rounded-lg border bg-white p-4 ${tones[tone]}`}>
      <p className="text-xs uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-slate-600">{note}</p>}
    </div>
  );
}

/** Deepa's view: how Raghav is doing and whether the guardrails hold. Read only. */
export function OversightPanel({ reviewRows, monitor }: { reviewRows: DashboardRow[]; monitor: MonitorView }) {
  const decided = reviewRows.filter((r) => r.decision);
  const waiting = reviewRows.length - decided.length;
  const rejected = decided.filter((r) => r.decision?.action === "rejected").length;
  const changed = decided.filter((r) => r.decision?.action === "edited").length;
  const { rejection, latestActual, killSwitch, thresholds } = monitor;

  const lossValue = latestActual ? `${Number(latestActual.total_loss_lakh)} lakh` : "None entered";
  const lossTone = latestActual?.level === "stop" ? "bad" : latestActual?.level === "warn" ? "warn" : "plain";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Oversight for Deepa</h2>
          <p className="text-sm text-slate-600">This view is read only. Raghav decides each line; you watch the guardrails.</p>
        </div>
        <Link href="/monitor" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Enter losses or resume the kill switch
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Waiting on Raghav" value={`${waiting} of ${reviewRows.length}`} note="Lines in this run not yet decided" tone={waiting > 0 ? "warn" : "good"} />
        <Card label="Raghav's calls" value={`${decided.length - rejected} yes, ${rejected} no`} note={changed > 0 ? `${changed} with a changed quantity` : "No quantities changed"} />
        <Card
          label="Rejection rate (30 days)"
          value={rejection.rate === null ? "Not measured" : `${Math.round(rejection.rate * 100)}%`}
          note={rejection.rate === null ? `Needs ${monitor.minLines} decided lines, has ${rejection.decided}` : "Healthy is 15% to 30%. Warning above 50%."}
          tone={rejection.warning ? "warn" : "plain"}
        />
        <Card
          label="Loss this quarter"
          value={lossValue}
          note={`Baseline ${thresholds.BASELINE_LOSS_LAKH}. Warning above ${thresholds.LOSS_WARN_LAKH}. Stop above ${thresholds.LOSS_STOP_LAKH}.`}
          tone={lossTone}
        />
      </div>

      <div className={`rounded-lg border p-3 text-sm ${killSwitch.active ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>
        Kill switch: <span className="font-semibold">{killSwitch.active ? "ON" : "off"}</span>
        {killSwitch.active ? `. ${killSwitch.reason ?? ""}` : ". Runs and pushes are allowed."}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Raghav&rsquo;s call</th>
              <th className="px-3 py-2 text-right font-medium">Recommended order</th>
              <th className="px-3 py-2 text-right font-medium">Final</th>
              <th className="px-3 py-2 font-medium">Reason</th>
              <th className="px-3 py-2 font-medium">When (IST)</th>
            </tr>
          </thead>
          <tbody>
            {decided.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-slate-600">
                  No decisions yet in this run.
                </td>
              </tr>
            )}
            {[...decided]
              .sort((a, b) => (b.decision?.decided_at ?? "").localeCompare(a.decision?.decided_at ?? ""))
              .map((r) => (
                <tr key={r.id} className="border-t border-slate-200 align-top">
                  <td className="px-3 py-2">
                    <span className="font-medium">{r.sku_id}</span> <span className="text-xs text-slate-600">{r.sku_name}</span>
                  </td>
                  <td className="px-3 py-2">{CALL[r.decision?.action ?? ""] ?? r.decision?.action}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{orderText(r.flag, r.recommended_qty)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.decision?.action === "rejected" ? "None" : finalQtyText(r.decision?.final_qty ?? 0)}</td>
                  <td className="px-3 py-2 text-slate-700">{r.decision?.reason ?? ""}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.decision ? when(r.decision.decided_at) : ""}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
