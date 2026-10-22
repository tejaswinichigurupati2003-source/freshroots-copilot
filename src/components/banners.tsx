import Link from "next/link";
import type { MonitorView } from "@/lib/db/monitor-store";

/** Kill switch (red), loss warning (amber) and rejection early warning (amber). Shown on every page. */
export function Banners({ monitor }: { monitor: MonitorView }) {
  const { killSwitch, latestActual, rejection, thresholds } = monitor;
  return (
    <>
      {killSwitch.active && (
        <div role="alert" className="rounded-md bg-red-600 p-4 text-white">
          <p className="font-semibold">Kill switch is ON. Scheduled runs, Run now and pushes to Zoho are paused.</p>
          <p className="text-sm">{killSwitch.reason ?? "No reason recorded."}</p>
          <Link href="/monitor" className="text-sm underline">
            Resume with the PIN on the Monitor page
          </Link>
        </div>
      )}
      {latestActual?.level === "warn" && (
        <div role="alert" className="rounded-md border border-amber-400 bg-amber-50 p-4 text-amber-900">
          <p className="font-semibold">
            Loss warning: {latestActual.period} is at {Number(latestActual.total_loss_lakh)} lakh, above the {thresholds.LOSS_WARN_LAKH} lakh warning line.
          </p>
          <p className="text-sm">The system stops on its own above {thresholds.LOSS_STOP_LAKH} lakh.</p>
        </div>
      )}
      {rejection.warning && rejection.rate !== null && (
        <div role="alert" className="rounded-md border border-amber-400 bg-amber-50 p-4 text-amber-900">
          <p className="font-semibold">
            Early warning: {Math.round(rejection.rate * 100)}% of recent recommendations were rejected ({rejection.rejected} of {rejection.decided} in 30 days).
          </p>
          <p className="text-sm">Review the rules with Raghav and Deepa. The system keeps running.</p>
        </div>
      )}
    </>
  );
}

export function NavLinks({ current }: { current: "dashboard" | "monitor" | "audit" }) {
  const link = (href: string, label: string, active: boolean) => (
    <Link href={href} className={active ? "font-semibold underline" : "text-slate-600 hover:underline"}>
      {label}
    </Link>
  );
  return (
    <nav className="flex gap-4 text-sm">
      {link("/", "Recommendations", current === "dashboard")}
      {link("/monitor", "Monitor", current === "monitor")}
      {link("/audit", "Audit log", current === "audit")}
    </nav>
  );
}
