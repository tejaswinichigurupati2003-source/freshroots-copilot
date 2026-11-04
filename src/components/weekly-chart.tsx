import type { SalesTrend } from "@/lib/approval/trend";

const W = 640;
const H = 230;
const PAD = { top: 26, right: 18, bottom: 34, left: 52 };

const weekLabel = (week: string) => week.slice(week.indexOf("W"));

/** Total units sold per week across all SKUs, with the last four weeks marked against the long-run average. */
export function WeeklyChart({ trend }: { trend: SalesTrend }) {
  const { series, avg, last4Avg, changePct } = trend;
  const values = series.map((s) => s.units);
  // Start the scale just under the lowest week so real movement shows, rounded to the nearest hundred.
  const max = Math.ceil((Math.max(...values) * 1.06) / 100) * 100;
  const min = Math.max(0, Math.floor((Math.min(...values) * 0.88) / 100) * 100);
  const x = (i: number) => PAD.left + (i * (W - PAD.left - PAD.right)) / (series.length - 1);
  const y = (v: number) => PAD.top + ((max - v) * (H - PAD.top - PAD.bottom)) / (max - min);

  const line = series.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.units).toFixed(1)}`).join(" ");
  const area = `${line} L${x(series.length - 1).toFixed(1)},${y(min).toFixed(1)} L${x(0).toFixed(1)},${y(min).toFixed(1)} Z`;
  const last = series[series.length - 1];
  const recentStart = x(series.length - 4);
  const ticks = [0, 0.5, 1].map((t) => Math.round((min + (max - min) * t) / 50) * 50);
  const sign = changePct >= 0 ? "+" : "";

  return (
    <div className="card-mint flex flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[20px]">Weekly sales, all SKUs</h2>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            Last 4 weeks average <span className="num font-medium text-ink">{Math.round(last4Avg).toLocaleString("en-IN")}</span> units, {sign}
            {changePct.toFixed(0)}% against the {series.length}-week average of <span className="num font-medium text-ink">{Math.round(avg).toLocaleString("en-IN")}</span>.
          </p>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full" role="img" aria-label={`Total units sold per week, ${weekLabel(series[0].week)} to ${weekLabel(last.week)}. Latest week ${last.units}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-mint-deep)" />
            <text x={PAD.left - 10} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--color-ink-soft)">
              {t.toLocaleString("en-IN")}
            </text>
          </g>
        ))}

        <rect x={recentStart} y={PAD.top - 8} width={x(series.length - 1) - recentStart + 10} height={H - PAD.top - PAD.bottom + 8} rx="10" fill="var(--color-lime-wash)" opacity="0.9" />
        <text x={recentStart + 8} y={PAD.top + 6} fontSize="10.5" fontWeight="700" fill="var(--color-forest)" letterSpacing="0.06em">
          LAST 4 WEEKS
        </text>

        <line x1={PAD.left} x2={W - PAD.right} y1={y(avg)} y2={y(avg)} stroke="var(--color-forest)" strokeDasharray="4 4" opacity="0.5" />
        <path d={area} fill="var(--color-forest)" opacity="0.08" />
        <path d={line} fill="none" stroke="var(--color-forest)" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />

        {series.map((s, i) => (
          <circle key={s.week} cx={x(i)} cy={y(s.units)} r={i === series.length - 1 ? 5 : 2.6} fill={i === series.length - 1 ? "var(--color-lime)" : "var(--color-forest)"} stroke="var(--color-forest)" strokeWidth={i === series.length - 1 ? 2.4 : 0}>
            <title>{`${weekLabel(s.week)}: ${s.units.toLocaleString("en-IN")} units`}</title>
          </circle>
        ))}

        {series.map((s, i) =>
          i % 2 === series.length % 2 || i === series.length - 1 ? (
            <text key={s.week} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--color-ink-soft)">
              {weekLabel(s.week)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
