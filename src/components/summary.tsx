import type { ReactNode } from "react";
import { rupees } from "@/lib/approval/exposure";
import { isEdgeCase } from "@/lib/approval/review";
import type { DashboardRow } from "@/lib/db/dashboard";

function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: string }) {
  return (
    <div className="flex-1 px-5 py-4 first:pl-0 last:pr-0 sm:basis-0">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-display text-[34px] leading-none" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      {note && <p className="mt-1.5 text-[13px] text-ink-soft">{note}</p>}
    </div>
  );
}

/** Four numbers a planner wants before reading any row. Separated by rules, not boxed in cards. */
export function Summary({ rows }: { rows: DashboardRow[] }) {
  const waiting = rows.filter((r) => !r.decision).length;
  const stockout = rows.filter((r) => r.flag === "STOCKOUT_RISK");
  const overstock = rows.filter((r) => r.flag === "OVERSTOCK_RISK");
  const high = rows.filter((r) => r.flag === "HIGH_DEMAND");
  const edge = rows.filter(isEdgeCase).length;
  const flagged = stockout.length + overstock.length + high.length;
  const sum = (list: DashboardRow[]) => list.reduce((total, r) => total + r.exposure_inr, 0);

  return (
    <section aria-label="Run summary" className="flex flex-col divide-y divide-rule border-y border-rule-strong sm:flex-row sm:divide-x sm:divide-y-0">
      <Stat
        label="To decide"
        value={
          <>
            <span className="num">{waiting}</span>
            <span className="text-ink-faint"> of </span>
            <span className="num">{rows.length}</span>
          </>
        }
        note={waiting === 0 ? "All decided" : "Not yet approved or rejected"}
        tone={waiting === 0 ? "var(--color-leaf)" : undefined}
      />
      <Stat label="At risk" value={<span className="num">{rupees(sum(rows))}</span>} note={`Stockout ${rupees(sum(stockout))}, overstock ${rupees(sum(overstock))}`} tone="var(--color-tomato)" />
      <Stat label="Flagged" value={<span className="num">{flagged}</span>} note={`${stockout.length} stockout, ${overstock.length} overstock, ${high.length} high demand`} />
      <Stat label="Edge cases" value={<span className="num">{edge}</span>} note="Need a closer look than the rules give" />
    </section>
  );
}
