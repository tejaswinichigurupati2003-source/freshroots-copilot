export interface PastLine {
  /** Flag the code gave this SKU in an earlier completed run. */
  flag: string;
  decision: { action: string; final_qty: number; reason: string | null; decided_by: string; decided_at: string } | null;
}

export interface SentDraft {
  /** Zoho purchase order number. */
  externalId: string;
  quantity: number;
  createdAt: string;
}

export interface CarryOver {
  /** How many runs in a row, this one included, gave the SKU the same flag. 1 means no repeat. */
  streak: number;
  /** What happened to this SKU the last time it needed a decision. */
  lastDecision: PastLine["decision"];
  /** Draft POs from earlier runs that are not in the open PO list, so their units are not counted as stock yet. */
  draftsNotCounted: SentDraft[];
}

/**
 * Context from earlier runs, for the person deciding. It never changes a flag or quantity.
 * `past` is newest first and only holds completed runs before this one.
 */
export function carryOver(opts: { flag: string; past: PastLine[]; drafts: SentDraft[]; openPoIds: string[] }): CarryOver {
  let streak = 1;
  if (opts.flag !== "OK") {
    for (const p of opts.past) {
      if (p.flag !== opts.flag) break;
      streak++;
    }
  }

  const counted = (externalId: string) => opts.openPoIds.some((id) => id === externalId || id.startsWith(`${externalId}:`));
  return {
    streak,
    lastDecision: opts.past.find((p) => p.decision)?.decision ?? null,
    draftsNotCounted: opts.drafts.filter((d) => !counted(d.externalId)),
  };
}
