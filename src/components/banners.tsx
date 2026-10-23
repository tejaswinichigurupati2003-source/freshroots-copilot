import Link from "next/link";
import type { ReactNode } from "react";
import type { MonitorView } from "@/lib/db/monitor-store";
import { getActingAs } from "@/lib/session";
import { ActingAsSelect } from "./acting-as-select";

function Notice({ tone, title, children }: { tone: "bad" | "warn"; title: string; children?: ReactNode }) {
  const color = tone === "bad" ? "var(--color-tomato)" : "var(--color-turmeric)";
  const wash = tone === "bad" ? "var(--color-tomato-wash)" : "var(--color-turmeric-wash)";
  return (
    <div role="alert" className="flex gap-3 border-l-4 py-3 pl-4 pr-4" style={{ borderColor: color, background: wash }}>
      <div>
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-0.5 text-sm text-ink-soft">{children}</div>}
      </div>
    </div>
  );
}

/** Kill switch, loss warning and rejection early warning. Shown on every page, above the masthead. */
export function Banners({ monitor }: { monitor: MonitorView }) {
  const { killSwitch, latestActual, rejection, thresholds } = monitor;
  if (!killSwitch.active && latestActual?.level !== "warn" && !rejection.warning) return null;

  return (
    <div className="flex flex-col gap-2">
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

const TABS = [
  { id: "dashboard", href: "/", label: "Recommendations" },
  { id: "monitor", href: "/monitor", label: "Monitor" },
  { id: "audit", href: "/audit", label: "Audit log" },
] as const;

function Sprig() {
  return (
    <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="8" fill="var(--color-leaf)" />
      <path d="M32 52V30" stroke="#fbf8f1" strokeWidth="4" strokeLinecap="round" />
      <path d="M32 33C32 22 24 15 13 15c0 11 7 18 19 18Z" fill="#fbf8f1" />
      <path d="M32 28c0-9 7-15 18-15 0 10-6 16-18 15Z" fill="#e9c35a" />
    </svg>
  );
}

/** Wordmark, page tabs, who is acting, and how the app is wired (Zoho mode, AI on or off). */
export async function Masthead({ current }: { current: (typeof TABS)[number]["id"] }) {
  const actor = await getActingAs();

  return (
    <header className="border-b-2 border-ink">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-3">
        <Link href="/" className="flex items-center gap-3" aria-label="Freshroots reorder desk, home">
          <Sprig />
          <span>
            <span className="block font-display text-[26px] leading-none">Freshroots</span>
            <span className="eyebrow mt-1 block">Reorder desk</span>
          </span>
        </Link>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <ActingAsSelect current={actor} />
        </div>
      </div>
      <nav aria-label="Pages" className="-mb-[2px] flex gap-1">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={tab.id === current ? "page" : undefined}
            className={`border-x border-t px-4 py-2 text-sm font-semibold ${
              tab.id === current ? "border-ink bg-paper text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
            style={tab.id === current ? { borderBottom: "2px solid var(--color-paper)" } : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
