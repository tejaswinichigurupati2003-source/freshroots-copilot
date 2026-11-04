import { nextScheduledRuns } from "@/lib/ingest/schedule";

const IST = { timeZone: "Asia/Kolkata" } as const;

/** The next four scheduled runs, laid out like the date cards in the reference. Festival months get the 1.25 uplift. */
export function UpcomingRuns({ festivalMonths }: { festivalMonths: string[] }) {
  const runs = nextScheduledRuns(new Date(), 4);

  return (
    <aside aria-label="Upcoming runs" className="flex flex-col gap-4">
      <div>
        <h2 className="text-[18px]">Upcoming runs</h2>
        <p className="text-[12px] text-ink-soft">Monday and Thursday, 7:00 am</p>
      </div>
      {runs.map((run, i) => {
        const day = run.toLocaleDateString("en-IN", { ...IST, day: "numeric" });
        const month = run.toLocaleDateString("en-IN", { ...IST, month: "long" });
        const weekday = run.toLocaleDateString("en-IN", { ...IST, weekday: "long" });
        const yearMonth = new Intl.DateTimeFormat("en-CA", { ...IST, year: "numeric", month: "2-digit" }).format(run);
        const festival = festivalMonths.includes(yearMonth);

        return (
          <div key={run.toISOString()} className="flex items-center gap-3">
            <div className="w-[62px] shrink-0 border-b border-rule-strong pb-1 text-center">
              <p className="font-display text-[34px] font-medium leading-none text-forest">{day}</p>
              <p className="text-[11px] text-ink-soft">{month}</p>
            </div>
            <div className={`flex-1 rounded-2xl p-3 ${i === 0 ? "bg-lime" : "bg-mint"}`}>
              <p className="text-[13px] font-bold text-forest-deep">{weekday}</p>
              <p className="text-[12px] text-forest/80">7:00 am run</p>
              <p className="mt-1 text-[11px] font-semibold text-forest-deep">{festival ? "Festival month, demand x1.25" : "Regular month"}</p>
            </div>
          </div>
        );
      })}
    </aside>
  );
}
