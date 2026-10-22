"use client";

import { useActionState } from "react";
import { pushToZoho, type DecisionState } from "@/app/actions";

export function PushButton({ readyLines, mode, blocked }: { readyLines: number; mode: "mock" | "live"; blocked: boolean }) {
  const [state, formAction, pending] = useActionState<DecisionState>(pushToZoho, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending || blocked || readyLines === 0}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send approved to Zoho"}
      </button>
      <span className="text-sm text-slate-600">
        {readyLines} approved {readyLines === 1 ? "line" : "lines"} ready. Drafts only, {mode === "mock" ? "saved in this app (mock mode)" : "created in Zoho Inventory"}.
        {blocked && " Paused by the kill switch."}
      </span>
      {state.error && (
        <p role="alert" className="w-full text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="w-full text-sm font-medium text-emerald-800">
          {state.message}
        </p>
      )}
    </form>
  );
}
