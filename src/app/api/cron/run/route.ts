import { NextResponse } from "next/server";
import { PgCronGuardStore } from "@/lib/db/cron-guard-store";
import { isAuthorizedCron } from "@/lib/ingest/cron-auth";
import { runScheduledOnce } from "@/lib/ingest/cron-guard";
import { httpStatusFor, runNow } from "@/lib/ingest/run-now";

export const dynamic = "force-dynamic";
// Gemini calls are paced for free-tier limits, so allow a longer run.
export const maxDuration = 60;

/**
 * Vercel Cron sends the CRON_SECRET as a bearer token. It can also deliver one trigger twice, so a repeat while a run
 * is going, or soon after one, is answered with 200 and skipped instead of starting a second run.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guarded = await runScheduledOnce(new PgCronGuardStore(), () => runNow("cron"));
  if (guarded.status === "skipped") return NextResponse.json({ status: "skipped", reason: guarded.reason });
  return NextResponse.json(guarded.result, { status: httpStatusFor(guarded.result) });
}
