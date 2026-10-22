"use client";

import { useActionState, useState } from "react";
import { decideAction, type DecisionState } from "@/app/actions";

type Mode = "idle" | "edit" | "reject";

const button = "rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50";

export function RowActions({ recommendationId, recommendedQty }: { recommendationId: string; recommendedQty: number }) {
  const [state, formAction, pending] = useActionState<DecisionState, FormData>(decideAction, {});
  const [mode, setMode] = useState<Mode>("idle");

  return (
    <form action={formAction} className="flex min-w-56 flex-col gap-2">
      <input type="hidden" name="recommendationId" value={recommendationId} />

      <div className="flex flex-wrap gap-1.5">
        <button type="submit" name="action" value="approve" disabled={pending} className={`${button} border-emerald-600 bg-emerald-600 text-white`}>
          Approve
        </button>
        <button type="button" onClick={() => setMode(mode === "edit" ? "idle" : "edit")} disabled={pending} className={`${button} border-slate-300 bg-white`}>
          Edit quantity
        </button>
        <button type="button" onClick={() => setMode(mode === "reject" ? "idle" : "reject")} disabled={pending} className={`${button} border-red-300 bg-white text-red-700`}>
          Reject
        </button>
      </div>

      {mode === "edit" && (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            name="quantity"
            min={0}
            step={1}
            defaultValue={recommendedQty}
            aria-label="New quantity"
            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          <button type="submit" name="action" value="edit" disabled={pending} className={`${button} border-slate-700 bg-slate-700 text-white`}>
            Save and approve
          </button>
        </div>
      )}

      {mode === "reject" && (
        <div className="flex flex-col gap-1.5">
          <input
            type="text"
            name="reason"
            placeholder="Why are you rejecting this? (min 5 characters)"
            aria-label="Reason for rejecting"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          <button type="submit" name="action" value="reject" disabled={pending} className={`${button} self-start border-red-600 bg-red-600 text-white`}>
            Confirm reject
          </button>
        </div>
      )}

      {state.error && (
        <p role="alert" className="text-xs font-medium text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
