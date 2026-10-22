import { Banners, NavLinks } from "@/components/banners";
import { LossForm, ResumeForm } from "@/components/monitor-forms";
import { getDb } from "@/lib/db/client";
import { loadMonitor, type MonitorView } from "@/lib/db/monitor-store";
import { getThresholds } from "@/lib/monitor/types";
import { ROLLING_DAYS } from "@/lib/monitor/rejection";

export const dynamic = "force-dynamic";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
const card = "rounded-lg border border-slate-200 bg-white p-5";

function RejectionCard({ monitor }: { monitor: MonitorView }) {
  const { rejection, minLines } = monitor;
  return (
    <section className={card}>
      <h2 className="text-lg font-semibold">Rejection rate, last {ROLLING_DAYS} days</h2>
      {rejection.evaluated && rejection.rate !== null ? (
        <p className="mt-2 text-3xl font-semibold tabular-nums">
          {Math.round(rejection.rate * 100)}%
          <span className="ml-2 text-sm font-normal text-slate-600">
            {rejection.rejected} of {rejection.decided} decided lines rejected
          </span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-700">
          Not measured yet: {rejection.decided} of {minLines} decided lines needed.
        </p>
      )}
      <p className="mt-2 text-sm text-slate-600">
        A healthy range is 15% to 30%. Above 50% raises an early warning for a manual review. The system keeps running.
      </p>
    </section>
  );
}

function LossCard({ monitor }: { monitor: MonitorView }) {
  const { latestActual, thresholds, losses } = monitor;
  const baseline = thresholds.BASELINE_LOSS_LAKH;
  const target = Math.round(baseline * 0.75 * 100) / 100;
  return (
    <section className={card}>
      <h2 className="text-lg font-semibold">Loss against baseline (lakh per quarter)</h2>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-slate-600">Baseline</dt>
          <dd className="text-2xl font-semibold tabular-nums">{baseline}</dd>
        </div>
        <div>
          <dt className="text-slate-600">Target (25% lower)</dt>
          <dd className="text-2xl font-semibold tabular-nums">{target}</dd>
        </div>
        <div>
          <dt className="text-slate-600">Latest actual{latestActual ? ` (${latestActual.period})` : ""}</dt>
          <dd className="text-2xl font-semibold tabular-nums">{latestActual ? Number(latestActual.total_loss_lakh) : "None yet"}</dd>
        </div>
        <div>
          <dt className="text-slate-600">Versus baseline</dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {latestActual ? `${Math.round(((Number(latestActual.total_loss_lakh) - baseline) / baseline) * 100)}%` : "n/a"}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-slate-600">
        Warning above {thresholds.LOSS_WARN_LAKH} lakh. Automatic stop above {thresholds.LOSS_STOP_LAKH} lakh.
      </p>

      <h3 className="mt-5 text-sm font-semibold">Enter a quarter&rsquo;s actual loss</h3>
      <div className="mt-2">
        <LossForm />
      </div>

      <table className="mt-5 w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="py-1 font-medium">Quarter</th>
            <th className="py-1 text-right font-medium">Stockout</th>
            <th className="py-1 text-right font-medium">Overstock</th>
            <th className="py-1 text-right font-medium">Total</th>
            <th className="py-1 pl-4 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {losses.map((l) => (
            <tr key={l.period} className="border-t border-slate-100">
              <td className="py-1">{l.period}</td>
              <td className="py-1 text-right tabular-nums">{Number(l.stockout_loss_lakh)}</td>
              <td className="py-1 text-right tabular-nums">{Number(l.overstock_loss_lakh)}</td>
              <td className="py-1 text-right tabular-nums">{Number(l.total_loss_lakh)}</td>
              <td className="py-1 pl-4 text-slate-600">{l.source === "actual" ? `Entered by ${l.entered_by ?? "unknown"}` : "Baseline (invented)"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function KillSwitchCard({ monitor }: { monitor: MonitorView }) {
  const { killSwitch } = monitor;
  return (
    <section className={card}>
      <h2 className="text-lg font-semibold">Kill switch</h2>
      {killSwitch.active ? (
        <>
          <p className="mt-2 text-sm font-medium text-red-700">
            ON since {killSwitch.tripped_at ? when(killSwitch.tripped_at) : "unknown"}. {killSwitch.reason}
          </p>
          <p className="mt-1 text-sm text-slate-600">Run an RCA before resuming. Enter the PIN to turn it off.</p>
          <div className="mt-3">
            <ResumeForm />
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-700">
          Off. Runs and pushes are allowed.
          {killSwitch.resumed_at && ` Last resumed by ${killSwitch.resumed_by} on ${when(killSwitch.resumed_at)}.`}
        </p>
      )}
    </section>
  );
}

export default async function MonitorPage() {
  let monitor: MonitorView;
  try {
    monitor = await loadMonitor(getDb(), getThresholds());
  } catch (err) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold">Monitor</h1>
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Could not load the monitor. Check DATABASE_URL in .env.local and that `npm run migrate` has run.
          <span className="mt-1 block text-xs">{err instanceof Error ? err.message : String(err)}</span>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <Banners monitor={monitor} />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Monitor</h1>
        <NavLinks current="monitor" />
      </header>
      <RejectionCard monitor={monitor} />
      <LossCard monitor={monitor} />
      <KillSwitchCard monitor={monitor} />
    </main>
  );
}
