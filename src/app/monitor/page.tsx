import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Banners, Masthead } from "@/components/banners";
import { LossForm, ResumeForm } from "@/components/monitor-forms";
import type { Actor } from "@/lib/approval/decide";
import { can, denial } from "@/lib/approval/roles";
import { getDb } from "@/lib/db/client";
import { loadMonitor, type MonitorView } from "@/lib/db/monitor-store";
import { ROLLING_DAYS } from "@/lib/monitor/rejection";
import { getThresholds } from "@/lib/monitor/types";
import { getActingAs } from "@/lib/session";

export const metadata: Metadata = { title: "Monitor" };
export const dynamic = "force-dynamic";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="border-t-2 border-ink pt-4">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-1 text-[28px]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Figure({ label, value, note, tone }: { label: string; value: ReactNode; note?: string; tone?: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-display text-[34px] leading-none" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      {note && <p className="mt-1.5 text-[13px] text-ink-soft">{note}</p>}
    </div>
  );
}

function RejectionSection({ monitor }: { monitor: MonitorView }) {
  const { rejection, minLines } = monitor;
  const measured = rejection.evaluated && rejection.rate !== null;
  return (
    <Section eyebrow={`Early warning, last ${ROLLING_DAYS} days`} title="How often Raghav says no">
      <div className="flex flex-wrap items-end gap-x-12 gap-y-4">
        <Figure
          label="Rejection rate"
          value={measured ? <span className="num">{Math.round((rejection.rate as number) * 100)}%</span> : <span className="font-display text-[26px] italic text-ink-soft">not measured yet</span>}
          note={measured ? `${rejection.rejected} of ${rejection.decided} decided lines rejected` : `${rejection.decided} of ${minLines} decided lines needed first`}
          tone={rejection.warning ? "var(--color-turmeric)" : undefined}
        />
        <p className="max-w-md text-sm text-ink-soft">
          A healthy range is <span className="num">15%</span> to <span className="num">30%</span>. Above <span className="num">50%</span> raises an early warning for a manual review. The system keeps running either way.
        </p>
      </div>
    </Section>
  );
}

function LossSection({ monitor, actor }: { monitor: MonitorView; actor: Actor }) {
  const { latestActual, thresholds, losses } = monitor;
  const baseline = thresholds.BASELINE_LOSS_LAKH;
  const target = Math.round(baseline * 0.75 * 100) / 100;
  const tone = latestActual?.level === "stop" ? "var(--color-tomato)" : latestActual?.level === "warn" ? "var(--color-turmeric)" : undefined;

  return (
    <Section eyebrow="Lagging check, lakh per quarter" title="Loss against the baseline">
      <div className="grid gap-x-10 gap-y-5 sm:grid-cols-4">
        <Figure label="Baseline" value={<span className="num">{baseline}</span>} note="Mean of the last four quarters" />
        <Figure label="Target, 25% lower" value={<span className="num">{target}</span>} />
        <Figure label={`Latest actual${latestActual ? `, ${latestActual.period}` : ""}`} value={latestActual ? <span className="num">{Number(latestActual.total_loss_lakh)}</span> : <span className="font-display text-[26px] italic text-ink-soft">none yet</span>} tone={tone} />
        <Figure label="Against baseline" value={latestActual ? <span className="num">{Math.round(((Number(latestActual.total_loss_lakh) - baseline) / baseline) * 100)}%</span> : <span className="text-ink-faint">-</span>} tone={tone} />
      </div>
      <p className="mt-4 text-sm text-ink-soft">
        Warning above <span className="num">{thresholds.LOSS_WARN_LAKH}</span> lakh. The system stops on its own above <span className="num">{thresholds.LOSS_STOP_LAKH}</span> lakh.
      </p>

      <div className="panel mt-5 p-4">
        <h3 className="text-lg">Enter a quarter&rsquo;s actual loss</h3>
        <div className="mt-3">
          {can(actor, "enter_loss") ? <LossForm /> : <p className="text-sm text-ink-soft">{denial(actor, "enter_loss")} Switch to Deepa to enter a figure.</p>}
        </div>
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
                <td className="!py-2.5">{l.period}</td>
                <td className="num !py-2.5 text-right">{Number(l.stockout_loss_lakh)}</td>
                <td className="num !py-2.5 text-right">{Number(l.overstock_loss_lakh)}</td>
                <td className="num !py-2.5 text-right font-semibold">{Number(l.total_loss_lakh)}</td>
                <td className="!py-2.5 text-ink-soft">{l.source === "actual" ? `Entered by ${l.entered_by ?? "unknown"}` : "Baseline quarter"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function KillSwitchSection({ monitor, actor }: { monitor: MonitorView; actor: Actor }) {
  const { killSwitch } = monitor;
  return (
    <Section eyebrow="Automatic stop" title="Kill switch">
      {killSwitch.active ? (
        <div className="border-l-4 border-tomato bg-tomato-wash p-4">
          <p className="font-semibold text-tomato">ON since {killSwitch.tripped_at ? when(killSwitch.tripped_at) : "unknown"}</p>
          <p className="mt-1 text-sm">{killSwitch.reason}</p>
          <p className="mt-2 text-sm text-ink-soft">Run an RCA before resuming. Deepa enters the PIN to turn it off.</p>
          <div className="mt-4">{can(actor, "resume") ? <ResumeForm /> : <p className="text-sm text-ink-soft">{denial(actor, "resume")} Switch to Deepa to resume.</p>}</div>
        </div>
      ) : (
        <p className="border-l-4 border-leaf bg-leaf-wash p-4">
          <span className="font-semibold text-leaf-deep">Off.</span> Runs and pushes are allowed.
          {killSwitch.resumed_at && <span className="text-ink-soft"> Last resumed by {killSwitch.resumed_by} on {when(killSwitch.resumed_at)}.</span>}
        </p>
      )}
    </Section>
  );
}

export default async function MonitorPage() {
  const actor = await getActingAs();
  let monitor: MonitorView;
  try {
    monitor = await loadMonitor(getDb(), getThresholds());
  } catch (err) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-[40px]">Monitor</h1>
        <p role="alert" className="mt-4 border-l-4 border-tomato bg-tomato-wash p-4 text-sm">
          <span className="font-semibold">Could not load the monitor.</span> Check DATABASE_URL in .env.local and that `npm run migrate` has run.
          <span className="num mt-1 block text-xs text-ink-soft">{err instanceof Error ? err.message : String(err)}</span>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-8 px-5 pb-20 pt-5 sm:px-8">
      <Banners monitor={monitor} />
      <Masthead current="monitor" />
      <div>
        <h1 className="text-[40px] sm:text-[46px]">Monitor</h1>
      </div>
      <RejectionSection monitor={monitor} />
      <LossSection monitor={monitor} actor={actor} />
      <KillSwitchSection monitor={monitor} actor={actor} />
    </main>
  );
}
