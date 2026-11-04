import Link from "next/link";
import type { ReactNode } from "react";
import type { MonitorView } from "@/lib/db/monitor-store";

function Item({ icon, label, value, note, tone }: { icon: ReactNode; label: string; value: ReactNode; note: string; tone?: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-forest">{icon}</span>
      <div>
        <p className="text-[12px] font-bold text-ink-soft">{label}</p>
        <p className="font-display text-[22px] font-semibold leading-tight" style={tone ? { color: tone } : undefined}>
          {value}
        </p>
        <p className="text-[12px] text-ink-soft">{note}</p>
      </div>
    </div>
  );
}

const svg = (children: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

/** Rejection rate, loss and kill switch in one row, like the gauges at the foot of the reference. Links to Monitor. */
export function MonitorStrip({ monitor }: { monitor: MonitorView }) {
  const { rejection, latestActual, killSwitch, thresholds, minLines } = monitor;
  const lossTone = latestActual?.level === "stop" ? "var(--color-tomato)" : latestActual?.level === "warn" ? "var(--color-turmeric)" : undefined;

  return (
    <Link href="/monitor" className="card-mint grid divide-y divide-mint-deep sm:grid-cols-3 sm:divide-x sm:divide-y-0" aria-label="Open the monitor">
      <Item
        icon={svg(<><path d="M18 20V10M12 20V4M6 20v-6" /></>)}
        label="Rejection rate, 30 days"
        value={rejection.rate === null ? <span className="text-[17px] font-medium italic text-ink-soft">not measured yet</span> : <span className="num">{Math.round(rejection.rate * 100)}%</span>}
        note={rejection.rate === null ? `${rejection.decided} of ${minLines} decided lines needed` : `${rejection.rejected} of ${rejection.decided} lines rejected`}
        tone={rejection.warning ? "var(--color-turmeric)" : undefined}
      />
      <Item
        icon={svg(<><path d="M6 4h12M6 9h12M9 4c5 0 6 5 0 5l7 9" /></>)}
        label="Loss this quarter"
        value={latestActual ? <span className="num">{Number(latestActual.total_loss_lakh)} lakh</span> : <span className="text-[17px] font-medium italic text-ink-soft">none entered</span>}
        note={`Baseline ${thresholds.BASELINE_LOSS_LAKH}, stops above ${thresholds.LOSS_STOP_LAKH}`}
        tone={lossTone}
      />
      <Item
        icon={svg(<><path d="M12 3 3 8v5c0 5 4 8 9 9 5-1 9-4 9-9V8l-9-5Z" />{killSwitch.active ? <path d="m9 9 6 6M15 9l-6 6" /> : <path d="m9 12 2 2 4-4" />}</>)}
        label="Kill switch"
        value={killSwitch.active ? "ON" : "Off"}
        note={killSwitch.active ? "Runs and orders are paused" : "Runs and orders are allowed"}
        tone={killSwitch.active ? "var(--color-tomato)" : "var(--color-leaf-deep)"}
      />
    </Link>
  );
}
