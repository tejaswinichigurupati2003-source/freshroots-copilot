"use client";

import { useActionState, useState } from "react";
import { decideAction, type DecisionState } from "@/app/actions";

type Mode = "idle" | "edit" | "reject";

export function RowActions({ recommendationId, recommendedQty }: { recommendationId: string; recommendedQty: number }) {
  const [state, formAction, pending] = useActionState<DecisionState, FormData>(decideAction, {});
  const [mode, setMode] = useState<Mode>("idle");

  return (
    <form action={formAction} className="flex min-w-44 flex-col gap-2.5">
      <input type="hidden" name="recommendationId" value={recommendationId} />

      <div className="flex flex-wrap gap-2">
        <button type="submit" name="action" value="approve" disabled={pending} className="btn btn-small btn-primary">
          Approve
        </button>
        <button type="button" onClick={() => setMode(mode === "edit" ? "idle" : "edit")} disabled={pending} className="btn btn-small" aria-expanded={mode === "edit"}>
          Change qty
        </button>
        <button type="button" onClick={() => setMode(mode === "reject" ? "idle" : "reject")} disabled={pending} className="btn btn-small btn-danger" aria-expanded={mode === "reject"}>
          Reject
        </button>
      </div>

      {mode === "edit" && (
        <div className="flex items-center gap-2 rounded-2xl bg-mint p-2.5">
          <input type="number" name="quantity" min={0} step={1} defaultValue={recommendedQty} aria-label="New quantity" className="field num w-24" />
          <button type="submit" name="action" value="edit" disabled={pending} className="btn btn-small btn-primary">
            Save and approve
          </button>
        </div>
      )}

      {mode === "reject" && (
        <div className="flex flex-col gap-2 rounded-2xl bg-tomato-wash p-2.5">
          <input type="text" name="reason" placeholder="Why? At least 5 characters" aria-label="Reason for rejecting" className="field" />
          <button type="submit" name="action" value="reject" disabled={pending} className="btn btn-small btn-danger-solid self-start">
            Confirm reject
          </button>
        </div>
      )}

      {state.error && (
        <p role="alert" className="rounded-xl bg-tomato-wash px-3 py-2 text-xs font-semibold text-tomato">
          {state.error}
        </p>
      )}
    </form>
  );
}
