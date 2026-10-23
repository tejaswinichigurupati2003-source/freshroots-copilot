import { RULES_CONFIG } from "../rules/engine";

export interface ExposureInput {
  flag: string;
  effectiveStock: number;
  /** 12-week average weekly sales, before any festival uplift. */
  avg12: number | null;
  festival: boolean;
  perishability: string;
  stockoutLossPerUnit: number;
  overstockLossPerUnit: number;
}

/** Halves round to the even number, as Python does, so figures match the answer key to the rupee. */
function roundHalfEven(n: number): number {
  const floor = Math.floor(n);
  const diff = n - floor;
  if (diff === 0.5) return floor % 2 === 0 ? floor : floor + 1;
  return Math.round(n);
}

/**
 * Indicative rupees at risk for one SKU (assumption A6 in docs/generate_expected_results.py):
 * units short of the minimum cover times the stockout loss per unit, or units above the maximum cover
 * times the overstock loss per unit. It is a size-of-the-problem figure, not a forecast of actual loss.
 */
export function exposureInr(i: ExposureInput): number {
  if (i.avg12 === null) return 0;
  const demand = i.festival ? i.avg12 * RULES_CONFIG.festivalUplift : i.avg12;
  const limits = i.perishability === "High" ? RULES_CONFIG.highPerishableCover : RULES_CONFIG.generalCover;

  if (i.flag === "STOCKOUT_RISK") return roundHalfEven(Math.max(0, limits.min * demand - i.effectiveStock) * i.stockoutLossPerUnit);
  if (i.flag === "OVERSTOCK_RISK") return roundHalfEven(Math.max(0, i.effectiveStock - limits.max * demand) * i.overstockLossPerUnit);
  return 0;
}

/** Indian digit grouping with the rupee sign, for example ₹24,388 or ₹1,20,000. */
export function rupees(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}
