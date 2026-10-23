import { NextResponse } from "next/server";
import { can, denial } from "@/lib/approval/roles";
import { httpStatusFor, runNow } from "@/lib/ingest/run-now";
import { getActingAs } from "@/lib/session";

export const dynamic = "force-dynamic";
// Gemini calls are paced for free-tier limits, so allow a longer run.
export const maxDuration = 60;

/** "Run now" button. Only the planner starts a manual run. */
export async function POST() {
  const actor = await getActingAs();
  if (!can(actor, "run")) return NextResponse.json({ status: "forbidden", message: denial(actor, "run") }, { status: 403 });

  const result = await runNow(`manual:${actor}`);
  return NextResponse.json(result, { status: httpStatusFor(result) });
}
