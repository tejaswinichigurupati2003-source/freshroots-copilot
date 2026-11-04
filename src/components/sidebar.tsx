"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const icon = (children: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

const ITEMS = [
  { href: "/", label: "Overview", match: (p: string) => p === "/", icon: icon(<><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></>) },
  { href: "/monitor", label: "Monitor", match: (p: string) => p.startsWith("/monitor"), icon: icon(<path d="M3 12h4l3-8 4 16 3-8h4" />) },
  { href: "/audit", label: "Audit log", match: (p: string) => p.startsWith("/audit"), icon: icon(<><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>) },
];

function Sprig() {
  return (
    <svg width="34" height="34" viewBox="0 0 64 64" aria-hidden>
      <path d="M32 54V28" stroke="#e4f56b" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M32 34C32 21 23 13 10 13c0 12 8 21 22 21Z" fill="#e4f56b" />
      <path d="M32 28c0-10 8-17 21-17 0 11-7 18-21 17Z" fill="#9fd36a" />
    </svg>
  );
}

/** Fixed dark column on large screens, a scrolling strip across the top on small ones. */
export function Sidebar({ nextRun, overviewLabel = "Overview" }: { nextRun: string; overviewLabel?: string }) {
  const pathname = usePathname();

  return (
    <aside className="bg-forest text-white lg:fixed lg:inset-y-3 lg:left-3 lg:flex lg:w-[212px] lg:flex-col lg:rounded-[28px] lg:p-5">
      <div className="flex items-center gap-3 px-3 py-3 lg:block lg:p-0">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Freshroots reorder desk, home">
          <Sprig />
          <span className="hidden font-display text-[23px] font-semibold leading-none text-white sm:inline">freshroots</span>
        </Link>

        <nav aria-label="Pages" className="flex min-w-0 gap-1 overflow-x-auto lg:mt-9 lg:flex-col lg:overflow-visible">
          {ITEMS.map((item) => {
            const on = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-3.5 py-2.5 text-[14px] font-semibold lg:gap-3 lg:px-4 ${on ? "bg-lime text-forest-deep" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
              >
                {item.icon}
                {item.href === "/" ? overviewLabel : item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto hidden rounded-2xl bg-forest-soft p-4 lg:block">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-lime">Next run</p>
        <p className="mt-1 font-display text-[17px] leading-snug text-white">{nextRun}</p>
        <p className="mt-1.5 text-xs text-white/70">{overviewLabel === "Oversight" ? "Every Monday and Thursday. Raghav can also start a run any time." : "Every Monday and Thursday. Run now is on the Reorder desk."}</p>
      </div>
    </aside>
  );
}
