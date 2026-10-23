const WIDTH = 104;
const HEIGHT = 32;
const PAD = 4;

/** Weekly units for the last 12 weeks as a hand-drawn-looking line. The last point wears the flag's colour. */
export function Sparkline({ values, color = "var(--color-ink)" }: { values: number[]; color?: string }) {
  if (values.length < 2) return <span className="text-xs italic text-ink-faint">too new to chart</span>;

  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const points = values.map((v, i) => [
    PAD + (i * (WIDTH - 2 * PAD)) / (values.length - 1),
    HEIGHT - PAD - ((v - min) * (HEIGHT - 2 * PAD)) / span,
  ]);
  const last = points[points.length - 1];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const meanY = HEIGHT - PAD - ((mean - min) * (HEIGHT - 2 * PAD)) / span;

  return (
    <svg width={WIDTH} height={HEIGHT} role="img" aria-label={`Weekly sales, last ${values.length} weeks: ${values.join(", ")}`}>
      <line x1={PAD} x2={WIDTH - PAD} y1={meanY} y2={meanY} stroke="var(--color-rule-strong)" strokeDasharray="2 3" />
      <polyline points={points.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ")} fill="none" stroke="var(--color-ink)" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3.2" fill={color} stroke="var(--color-card)" strokeWidth="1.2" />
    </svg>
  );
}
