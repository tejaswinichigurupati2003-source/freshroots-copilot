import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/ingest/cron-auth";
import { httpStatusFor, runNow } from "@/lib/ingest/run-now";

export const dynamic = "force-dynamic";
// Gemini calls are paced for free-tier limits, so allow a longer run.
export const maxDuration = 60;

/** Vercel Cron sends the CRON_SECRET as a bearer token. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runNow("cron");
  return NextResponse.json(result, { status: httpStatusFor(result) });
}
