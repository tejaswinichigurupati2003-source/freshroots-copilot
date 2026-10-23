/** Flag colours: [text and border, wash]. Produce palette from globals.css. */
export const FLAG_TONES: Record<string, { label: string; ink: string; wash: string }> = {
  STOCKOUT_RISK: { label: "Stockout", ink: "var(--color-tomato)", wash: "var(--color-tomato-wash)" },
  OVERSTOCK_RISK: { label: "Overstock", ink: "var(--color-turmeric)", wash: "var(--color-turmeric-wash)" },
  HIGH_DEMAND: { label: "High demand", ink: "var(--color-indigo)", wash: "var(--color-indigo-wash)" },
  INSUFFICIENT_HISTORY: { label: "No history", ink: "var(--color-plum)", wash: "var(--color-plum-wash)" },
  OK: { label: "OK", ink: "var(--color-leaf)", wash: "var(--color-leaf-wash)" },
};

const EDGE_LABELS: Record<string, string> = {
  NEW_LAUNCH: "New launch",
  DISTRIBUTOR_DROP: "Distributor drop",
  ONE_OFF_SPIKE: "One-off spike",
  OTHER: "Other",
};

/** A stamped sticker for the rule outcome. */
export function FlagBadge({ flag }: { flag: string }) {
  const tone = FLAG_TONES[flag] ?? { label: flag, ink: "var(--color-ink-soft)", wash: "var(--color-card)" };
  return (
    <span className="tag" style={{ color: tone.ink, background: tone.wash }}>
      <span aria-hidden className="inline-block h-1.5 w-1.5" style={{ background: tone.ink }} />
      {tone.label}
    </span>
  );
}

/** Dashed outline, so an edge case reads as "look closer" and not as a second verdict. */
export function EdgeBadge({ type, hasSignals }: { type: string | null; hasSignals: boolean }) {
  const label = type && type !== "NONE" ? (EDGE_LABELS[type] ?? type) : hasSignals ? "Look closer" : null;
  if (!label) return null;
  return (
    <span className="tag" style={{ color: "var(--color-plum)", borderStyle: "dashed" }}>
      {label}
    </span>
  );
}
