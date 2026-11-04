"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunNowButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/run", { method: "POST" });
      const body = (await response.json()) as { status: string; message?: string };
      if (body.status !== "completed") setError(body.message ?? "The run did not finish.");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button type="button" onClick={run} disabled={running} className="btn btn-lime px-6 py-2.5 text-[15px]">
        {running ? (
          <>
            <span aria-hidden className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-forest border-t-transparent" />
            Running the forecast
          </>
        ) : (
          "Run now"
        )}
      </button>
      {running && <p className="max-w-56 text-xs text-ink-soft sm:text-right">Reading stock, applying the rules, then asking the AI to write the reasons. Up to a minute.</p>}
      {error && (
        <p role="alert" className="max-w-72 rounded-xl bg-tomato-wash px-3 py-2 text-xs font-semibold text-tomato">
          {error}
        </p>
      )}
    </div>
  );
}
