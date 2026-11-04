import { RULES_CONFIG } from "../rules/engine";
import { rupees } from "./exposure";

export interface WorkingInput {
  flag: string;
  unitsOnHand: number | null;
  openPoUnits: number | null;
  effectiveStock: number;
  avg12: number | null;
  avg4: number | null;
  festival: boolean;
  perishability: string;
  standardQty: number;
  recommendedQty: number;
  unitCostInr: number;
}

export interface WorkingStep {
  label: string;
  text: string;
}

const n = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 1 });

/** Purchase value of an order. A cost of 0 means no cost on file, so there is no figure. */
export function purchaseValueInr(qty: number, unitCostInr: number): number | null {
  return qty > 0 && unitCostInr > 0 ? Math.round(qty * unitCostInr) : null;
}

/** The arithmetic behind a line, in the order the rules apply it. Every number comes from the saved run. */
export function workingSteps(i: WorkingInput): WorkingStep[] {
  if (i.avg12 === null) {
    return [{ label: "History", text: `There are fewer than ${RULES_CONFIG.historyWeeksRequired} weeks of sales, so the rules give no flag and no quantity.` }];
  }

  const steps: WorkingStep[] = [];
  const open = i.openPoUnits ?? 0;
  steps.push({
    label: "Stock",
    text: i.unitsOnHand === null ? `${n(i.effectiveStock)} units counting open POs.` : `${n(i.unitsOnHand)} on hand + ${n(open)} on open POs = ${n(i.effectiveStock)} units.`,
  });

  const demand = i.festival ? i.avg12 * RULES_CONFIG.festivalUplift : i.avg12;
  steps.push({
    label: "Weekly demand",
    text: i.festival ? `${n(i.avg12)} (12-week average) × ${RULES_CONFIG.festivalUplift} festival month = ${n(demand)} a week.` : `${n(i.avg12)} a week (12-week average).`,
  });

  const limits = i.perishability === "High" ? RULES_CONFIG.highPerishableCover : RULES_CONFIG.generalCover;
  const cover = demand > 0 ? i.effectiveStock / demand : null;
  if (cover !== null) {
    steps.push({
      label: "Weeks of cover",
      text: `${n(i.effectiveStock)} ÷ ${n(demand)} = ${n(cover)} weeks. Limits are ${limits.min} to ${limits.max} weeks${i.perishability === "High" ? " (high perishability)" : ""}.`,
    });
  }

  if (i.avg4 !== null && i.avg12 > 0) {
    const pct = Math.round((i.avg4 / i.avg12 - 1) * 100);
    const spike = i.avg4 > RULES_CONFIG.spikeRatio * i.avg12;
    steps.push({
      label: "Demand spike",
      text: `Last 4 weeks average ${n(i.avg4)}, ${pct >= 0 ? `${pct}% above` : `${-pct}% below`} the 12-week average. ${spike ? "That is over" : "The spike test needs more than"} ${Math.round((RULES_CONFIG.spikeRatio - 1) * 100)}%.`,
    });
  }

  if (i.flag === "OVERSTOCK_RISK") {
    steps.push({ label: "Quantity", text: "Overstock: order nothing and pause the next order." });
  } else if (i.recommendedQty > 0 && i.standardQty > 0) {
    const multiple = i.recommendedQty / i.standardQty;
    steps.push({ label: "Quantity", text: `${n(multiple)} × standard order of ${n(i.standardQty)} = ${n(i.recommendedQty)} units.` });
  }

  const value = purchaseValueInr(i.recommendedQty, i.unitCostInr);
  if (value !== null) steps.push({ label: "Purchase value", text: `${n(i.recommendedQty)} × ${rupees(i.unitCostInr)} unit cost = ${rupees(value)}.` });

  return steps;
}
