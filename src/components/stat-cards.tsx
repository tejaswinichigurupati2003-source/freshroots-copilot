import type { ReactNode } from "react";
import { rupees } from "@/lib/approval/exposure";
import { isEdgeCase } from "@/lib/approval/review";
import type { DashboardRow } from "@/lib/db/dashboard";

const svg = (children: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

const ICONS = {
  decide: svg(<><path d="M9 11l3 3 8-8" /><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></>),
  risk: svg(<><path d="M6 4h12M6 9h12M9 4c5 0 6 5 0 5l7 9" /></>),
  flag: svg(<><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>),
  eye: svg(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /><path d="M11 8v3l2 1" /></>),
};

function Card({ dark, icon, label, value, note, progress }: { dark: boolean; icon: ReactNode; label: string; value: ReactNode; note: string; progress?: number }) {
  return (
    <div className={`${dark ? "card-forest" : "card-lime text-forest-deep"} flex min-h-[168px] flex-col justify-between p-5`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`text-[13px] font-bold ${dark ? "text-white/80" : "text-forest"}`}>{label}</p>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${dark ? "bg-lime text-forest-deep" : "bg-forest text-lime"}`}>{icon}</span>
      </div>
      <div>
        <p className="font-display text-[40px] font-semibold leading-none">{value}</p>
        {progress !== undefined && (
          <div className={`mt-3 h-1.5 overflow-hidden rounded-full ${dark ? "bg-white/20" : "bg-forest/15"}`} role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
            <div className={`h-full rounded-full ${dark ? "bg-lime" : "bg-forest"}`} style={{ width: `${progress}%` }} />
          </div>
        )}
        <p className={`mt-2 text-[13px] ${dark ? "text-white/70" : "text-forest/80"}`}>{note}</p>
      </div>
    </div>
  );
}

/** The four numbers a planner wants before reading any row. */
export function StatCards({ rows }: { rows: DashboardRow[] }) {
  const decided = rows.filter((r) => r.decision).length;
  const stockout = rows.filter((r) => r.flag === "STOCKOUT_RISK");
  const overstock = rows.filter((r) => r.flag === "OVERSTOCK_RISK");
  const high = rows.filter((r) => r.flag === "HIGH_DEMAND");
  const edge = rows.filter(isEdgeCase).length;
  const sum = (list: DashboardRow[]) => list.reduce((total, r) => total + r.exposure_inr, 0);
  const pct = rows.length === 0 ? 0 : (decided / rows.length) * 100;

  return (
    <section aria-label="This run" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card
        dark
        icon={ICONS.decide}
        label="Decided"
        value={
          <>
            <span className="num">{decided}</span>
            <span className="text-white/50"> of </span>
            <span className="num">{rows.length}</span>
          </>
        }
        note={decided === rows.length && rows.length > 0 ? "Every line is decided" : `${rows.length - decided} still waiting on a decision`}
        progress={pct}
      />
      <Card dark={false} icon={ICONS.risk} label="Rupees at risk" value={<span className="num text-[34px]">{rupees(sum(rows))}</span>} note={`Stockout ${rupees(sum(stockout))}, overstock ${rupees(sum(overstock))}`} />
      <Card dark icon={ICONS.flag} label="Flagged SKUs" value={<span className="num">{stockout.length + overstock.length + high.length}</span>} note={`${stockout.length} stockout, ${overstock.length} overstock, ${high.length} high demand`} />
      <Card dark={false} icon={ICONS.eye} label="Edge cases" value={<span className="num">{edge}</span>} note="The rules cannot judge these alone" />
    </section>
  );
}
