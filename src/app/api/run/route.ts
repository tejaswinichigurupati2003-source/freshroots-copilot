import { NextResponse } from "next/server";
import { httpStatusFor, runNow } from "@/lib/ingest/run-now";

export const dynamic = "force-dynamic";
// Gemini calls are paced for free-tier limits, so allow a longer run.
export const maxDuration = 60;

/** "Run now" button. */
export async function POST() {
  const result = await runNow("manual");
  return NextResponse.json(result, { status: httpStatusFor(result) });
}
