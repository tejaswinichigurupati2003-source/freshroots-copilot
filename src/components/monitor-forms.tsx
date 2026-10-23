"use client";
import type { ReactNode } from "react";

import { useActionState } from "react";
import { resumeAction, submitLoss, type DecisionState } from "@/app/actions";

function Feedback({ state }: { state: DecisionState }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="border-l-2 border-tomato pl-2 text-sm font-semibold text-tomato">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="border-l-2 border-leaf pl-2 text-sm font-semibold text-leaf-deep">
          {state.message}
        </p>
      )}
    </>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  );
}

export function LossForm() {
  const [state, formAction, pending] = useActionState<DecisionState, FormData>(submitLoss, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-4">
        <Labelled label="Quarter">
          <input name="period" placeholder="Oct-Dec 2026" className="field" />
        </Labelled>
        <Labelled label="Stockout loss (lakh)">
          <input name="stockoutLakh" type="number" step="0.01" min="0" className="field num w-36" />
        </Labelled>
        <Labelled label="Overstock loss (lakh)">
          <input name="overstockLakh" type="number" step="0.01" min="0" className="field num w-36" />
        </Labelled>
        <button type="submit" disabled={pending} className="btn btn-primary">
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
      <div className="flex flex-wrap items-end gap-4">
        <Labelled label="Resume PIN">
          <input name="pin" type="password" autoComplete="off" className="field num w-40" />
        </Labelled>
        <button type="submit" disabled={pending} className="btn btn-primary">
          Resume
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
