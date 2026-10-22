"use client";

import { useActionState } from "react";
import { resumeAction, submitLoss, type DecisionState } from "@/app/actions";

const input = "rounded-md border border-slate-300 px-2 py-1 text-sm";
const primary = "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60";

function Feedback({ state }: { state: DecisionState }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm font-medium text-emerald-800">
          {state.message}
        </p>
      )}
    </>
  );
}

export function LossForm() {
  const [state, formAction, pending] = useActionState<DecisionState, FormData>(submitLoss, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Quarter
          <input name="period" placeholder="Oct-Dec 2026" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Stockout loss (lakh)
          <input name="stockoutLakh" type="number" step="0.01" min="0" className={`${input} w-32`} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Overstock loss (lakh)
          <input name="overstockLakh" type="number" step="0.01" min="0" className={`${input} w-32`} />
        </label>
        <button type="submit" disabled={pending} className={primary}>
          Save loss
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function ResumeForm() {
  const [state, formAction, pending] = useActionState<DecisionState, FormData>(resumeAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Resume PIN
          <input name="pin" type="password" autoComplete="off" className={input} />
        </label>
        <button type="submit" disabled={pending} className={primary}>
          Resume
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
