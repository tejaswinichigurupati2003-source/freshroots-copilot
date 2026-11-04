import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LossForm, ResumeForm } from "@/components/monitor-forms";
import type { Actor } from "@/lib/approval/decide";
import { can, denial } from "@/lib/approval/roles";
import type { MonitorView } from "@/lib/db/monitor-store";
import { ROLLING_DAYS } from "@/lib/monitor/rejection";
import { getActingAs } from "@/lib/session";
import { getMonitorView } from "@/lib/shell-data";

export const metadata: Metadata = { title: "Monitor" };
export const dynamic = "force-dynamic";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";

function Figure({ label, value, note, tone }: { label: string; value: ReactNode; note?: string; tone?: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-display text-[34px] font-semibold leading-none" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      {note && <p className="mt-1.5 text-[13px] text-ink-soft">{note}</p>}
    </div>
  );
}

function RejectionCard({ monitor }: { monitor: MonitorView }) {
  const { rejection, minLines } = monitor;
  const measured = rejection.evaluated && rejection.rate !== null;
  return (
    <section className="card-mint p-6">
      <p className="eyebrow">Early warning, last {ROLLING_DAYS} days</p>
      <h2 className="mt-1 text-[22px]">How often Raghav says no</h2>
      <div className="mt-5">
        <Figure
          label="Rejection rate"
          value={measured ? <span className="num">{Math.round((rejection.rate as number) * 100)}%</span> : <span className="text-[22px] font-medium italic text-ink-soft">not measured yet</span>}
          note={measured ? `${rejection.rejected} of ${rejection.decided} decided lines rejected` : `${rejection.decided} of ${minLines} decided lines needed first`}
          tone={rejection.warning ? "var(--color-turmeric)" : undefined}
        />
      </div>
      <p className="mt-4 text-sm text-ink-soft">
        A healthy range is <span className="num">15%</span> to <span className="num">30%</span>. Above <span className="num">50%</span> raises an early warning for a manual review. The system keeps running either way.
      </p>
    </section>
  );
}

function KillSwitchCard({ monitor, actor }: { monitor: MonitorView; actor: Actor }) {
  const { killSwitch } = monitor;
  return (
    <section className={`${killSwitch.active ? "bg-tomato-wash" : "card-lime"} rounded-[20px] p-6`}>
      <p className="eyebrow">Automatic stop</p>
      <h2 className="mt-1 text-[22px]">Kill switch</h2>
      {killSwitch.active ? (
        <div className="mt-4">
          <p className="font-semibold text-tomato">ON since {killSwitch.tripped_at ? when(killSwitch.tripped_at) : "unknown"}</p>
          <p className="mt-1 text-sm">{killSwitch.reason}</p>
          <p className="mt-2 text-sm text-ink-soft">Run an RCA before resuming. Deepa enters the PIN to turn it off.</p>
          <div className="mt-4">{can(actor, "resume") ? <ResumeForm /> : <p className="text-sm text-ink-soft">{denial(actor, "resume")} Switch to Deepa to resume.</p>}</div>
        </div>
      ) : (
        <div className="mt-4">
          <p className="font-display text-[34px] font-semibold leading-none text-leaf-deep">Off</p>
          <p className="mt-1.5 text-sm text-forest/80">Runs and pushes are allowed.</p>
          {killSwitch.resumed_at && (
            <p className="mt-1 text-sm text-forest/80">
              Last resumed by {killSwitch.resumed_by} on {when(killSwitch.resumed_at)}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function LossCard({ monitor, actor }: { monitor: MonitorView; actor: Actor }) {
  const { latestActual, thresholds, losses } = monitor;
  const baseline = thresholds.BASELINE_LOSS_LAKH;
  const target = Math.round(baseline * 0.75 * 100) / 100;
  const tone = latestActual?.level === "stop" ? "var(--color-tomato)" : latestActual?.level === "warn" ? "var(--color-turmeric)" : undefined;

  return (
    <section className="card p-6">
      <p className="eyebrow">Lagging check, lakh per quarter</p>
      <h2 className="mt-1 text-[22px]">Loss against the baseline</h2>

      <div className="mt-5 grid gap-x-10 gap-y-5 sm:grid-cols-4">
        <Figure label="Baseline" value={<span className="num">{baseline}</span>} note="Mean of the last four quarters" />
        <Figure label="Target, 25% lower" value={<span className="num">{target}</span>} />
        <Figure
          label={`Latest actual${latestActual ? `, ${latestActual.period}` : ""}`}
          value={latestActual ? <span className="num">{Number(latestActual.total_loss_lakh)}</span> : <span className="text-[22px] font-medium italic text-ink-soft">none yet</span>}
          tone={tone}
        />
        <Figure label="Against baseline" value={latestActual ? <span className="num">{Math.round(((Number(latestActual.total_loss_lakh) - baseline) / baseline) * 100)}%</span> : <span className="text-ink-faint">-</span>} tone={tone} />
      </div>
      <p className="mt-4 text-sm text-ink-soft">
        Warning above <span className="num">{thresholds.LOSS_WARN_LAKH}</span> lakh. The system stops on its own above <span className="num">{thresholds.LOSS_STOP_LAKH}</span> lakh.
      </p>

      <div className="mt-5 rounded-2xl bg-mint p-5">
        <h3 className="text-[17px]">Enter a quarter&rsquo;s actual loss</h3>
        <div className="mt-3">{can(actor, "enter_loss") ? <LossForm /> : <p className="text-sm text-ink-soft">{denial(actor, "enter_loss")} Switch to Deepa to enter a figure.</p>}</div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="ledger">
          <thead>
            <tr>
              <th>Quarter</th>
              <th className="!text-right">Stockout</th>
              <th className="!text-right">Overstock</th>
              <th className="!text-right">Total</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {losses.map((l) => (
              <tr key={l.period}>
                <td className="!py-3 font-semibold">{l.period}</td>
                <td className="num !py-3 text-right">{Number(l.stockout_loss_lakh)}</td>
                <td className="num !py-3 text-right">{Number(l.overstock_loss_lakh)}</td>
                <td className="num !py-3 text-right font-semibold">{Number(l.total_loss_lakh)}</td>
                <td className="!py-3 text-ink-soft">{l.source === "actual" ? `Entered by ${l.entered_by ?? "unknown"}` : "Baseline quarter"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function MonitorPage() {
  const [actor, monitor] = await Promise.all([getActingAs(), getMonitorView()]);

  if (!monitor) {
    return (
      <>
        <h1 className="text-[32px]">Monitor</h1>
        <p role="alert" className="mt-4 rounded-2xl bg-tomato-wash p-4 text-sm">
          <span className="font-semibold">Could not load the monitor.</span> Check DATABASE_URL in .env.local and that `npm run migrate` has run.
        </p>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[32px] sm:text-[38px]">Monitor</h1>
      <div className="grid gap-5 lg:grid-cols-2">
        <RejectionCard monitor={monitor} />
        <KillSwitchCard monitor={monitor} actor={actor} />
      </div>
      <LossCard monitor={monitor} actor={actor} />
    </div>
  );
}
