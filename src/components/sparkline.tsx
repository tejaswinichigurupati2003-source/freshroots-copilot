const WIDTH = 96;
const HEIGHT = 28;
const PAD = 3;

/** Weekly units for the last 12 weeks as a small line. The last point is marked. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-xs text-slate-400">Too new to chart</span>;

  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const points = values.map((v, i) => [
    PAD + (i * (WIDTH - 2 * PAD)) / (values.length - 1),
    HEIGHT - PAD - ((v - min) * (HEIGHT - 2 * PAD)) / span,
  ]);
  const last = points[points.length - 1];

  return (
    <svg width={WIDTH} height={HEIGHT} role="img" aria-label={`Weekly sales, last ${values.length} weeks: ${values.join(", ")}`}>
      <polyline points={points.map((p) => p.join(",")).join(" ")} fill="none" stroke="#475569" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill="#0f172a" />
    </svg>
  );
}
