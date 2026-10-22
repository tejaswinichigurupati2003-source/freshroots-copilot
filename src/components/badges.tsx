const FLAGS: Record<string, { label: string; style: string }> = {
  STOCKOUT_RISK: { label: "Stockout risk", style: "bg-red-100 text-red-800" },
  OVERSTOCK_RISK: { label: "Overstock risk", style: "bg-amber-100 text-amber-800" },
  HIGH_DEMAND: { label: "High demand", style: "bg-blue-100 text-blue-800" },
  INSUFFICIENT_HISTORY: { label: "Not enough history", style: "bg-violet-100 text-violet-800" },
  OK: { label: "OK", style: "bg-emerald-100 text-emerald-800" },
};

const EDGE_LABELS: Record<string, string> = {
  NEW_LAUNCH: "New launch",
  DISTRIBUTOR_DROP: "Distributor drop",
  ONE_OFF_SPIKE: "One-off spike",
  OTHER: "Other edge case",
};

const pill = "inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium";

export function FlagBadge({ flag }: { flag: string }) {
  const f = FLAGS[flag] ?? { label: flag, style: "bg-slate-100 text-slate-800" };
  return <span className={`${pill} ${f.style}`}>{f.label}</span>;
}

/** Shows the LLM's classification, or a generic badge when only the code's signals fired. */
export function EdgeBadge({ type, hasSignals }: { type: string | null; hasSignals: boolean }) {
  const label = type && type !== "NONE" ? (EDGE_LABELS[type] ?? type) : hasSignals ? "Needs a look" : null;
  if (!label) return null;
  return <span className={`${pill} border border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800`}>{label}</span>;
}
