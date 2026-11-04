"use client";

import { useActionState } from "react";
import { pushToZoho, type DecisionState } from "@/app/actions";

/** Approved lines waiting to go to Zoho, and the one button that sends them. Sits on the lime card. */
export function PushButton({ readyLines, mode, blocked }: { readyLines: number; mode: "mock" | "live"; blocked: boolean }) {
  const [state, formAction, pending] = useActionState<DecisionState>(pushToZoho, {});
  return (
    <form action={formAction} className="flex h-full flex-col justify-between gap-5">
      <div>
        <p className="font-display text-[44px] font-semibold leading-none">
          <span className="num">{readyLines}</span>
        </p>
        <p className="mt-1 text-[15px] font-semibold">approved {readyLines === 1 ? "line" : "lines"} ready for Zoho</p>
        <p className="mt-1.5 text-[13px] text-forest/80">
          One draft purchase order per distributor. {mode === "mock" ? "Drafts are kept in this app and not sent to Zoho." : "Drafts are created in Zoho Inventory."}
          {blocked && " Paused by the kill switch."}
        </p>
      </div>
      <div className="flex flex-col gap-2.5">
        <button type="submit" disabled={pending || blocked || readyLines === 0} className="btn btn-primary w-full py-3 text-[15px]">
          {pending ? "Sending…" : "Send approved to Zoho"}
        </button>
        {state.error && (
          <p role="alert" className="rounded-xl bg-tomato-wash px-3 py-2 text-sm font-semibold text-tomato">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="rounded-xl bg-white/70 px-3 py-2 text-sm font-semibold text-leaf-deep">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
