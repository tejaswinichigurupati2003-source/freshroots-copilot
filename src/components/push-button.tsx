"use client";

import { useActionState } from "react";
import { pushToZoho, type DecisionState } from "@/app/actions";

/** The dispatch note: how many approved lines are waiting, and the one button that sends them. */
export function PushButton({ readyLines, mode, blocked }: { readyLines: number; mode: "mock" | "live"; blocked: boolean }) {
  const [state, formAction, pending] = useActionState<DecisionState>(pushToZoho, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div>
        <p className="eyebrow">Dispatch</p>
        <p className="mt-1 font-display text-xl">
          <span className="num">{readyLines}</span> approved {readyLines === 1 ? "line" : "lines"} ready for Zoho
        </p>
        <p className="mt-0.5 text-sm text-ink-soft">
          One draft purchase order per distributor. {mode === "mock" ? "Drafts are kept in this app and not sent to Zoho." : "Drafts are created in Zoho Inventory."}
          {blocked && " Paused by the kill switch."}
        </p>
      </div>
      <button type="submit" disabled={pending || blocked || readyLines === 0} className="btn btn-primary px-5 py-2.5 text-[15px]">
        {pending ? "Sending…" : "Send approved to Zoho"}
      </button>
      {state.error && (
        <p role="alert" className="w-full border-l-2 border-tomato pl-2 text-sm font-semibold text-tomato">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="w-full border-l-2 border-leaf pl-2 text-sm font-semibold text-leaf-deep">
          {state.message}
        </p>
      )}
    </form>
  );
}
