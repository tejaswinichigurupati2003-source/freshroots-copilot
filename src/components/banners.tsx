import Link from "next/link";
import type { ReactNode } from "react";
import type { MonitorView } from "@/lib/db/monitor-store";

function Notice({ tone, title, children }: { tone: "bad" | "warn"; title: string; children?: ReactNode }) {
  const color = tone === "bad" ? "var(--color-tomato)" : "var(--color-turmeric)";
  const wash = tone === "bad" ? "var(--color-tomato-wash)" : "var(--color-turmeric-wash)";
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl px-5 py-3.5" style={{ background: wash }}>
      <span aria-hidden className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <div>
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-0.5 text-sm text-ink-soft">{children}</div>}
      </div>
    </div>
  );
}

/** Kill switch, loss warning and rejection early warning. Shown at the top of every page. */
export function Banners({ monitor }: { monitor: MonitorView }) {
  const { killSwitch, latestActual, rejection, thresholds } = monitor;
  if (!killSwitch.active && latestActual?.level !== "warn" && !rejection.warning) return null;

  return (
    <div className="mb-5 flex flex-col gap-2">
      {killSwitch.active && (
        <Notice tone="bad" title="Kill switch is ON. Runs, Run now and orders to Zoho are paused.">
          {killSwitch.reason ?? "No reason recorded."}{" "}
          <Link href="/monitor" className="font-semibold text-tomato underline underline-offset-2">
            Deepa resumes it with the PIN on the Monitor page
          </Link>
        </Notice>
      )}
      {latestActual?.level === "warn" && (
        <Notice tone="warn" title={`Loss warning: ${latestActual.period} is at ${Number(latestActual.total_loss_lakh)} lakh, above the ${thresholds.LOSS_WARN_LAKH} lakh line.`}>
          The system stops on its own above {thresholds.LOSS_STOP_LAKH} lakh.
        </Notice>
      )}
      {rejection.warning && rejection.rate !== null && (
        <Notice tone="warn" title={`Early warning: ${Math.round(rejection.rate * 100)}% of recent recommendations were rejected (${rejection.rejected} of ${rejection.decided} in 30 days).`}>
          Review the rules with Raghav and Deepa. The system keeps running.
        </Notice>
      )}
    </div>
  );
}
