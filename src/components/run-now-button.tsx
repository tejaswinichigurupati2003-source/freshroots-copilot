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
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {running ? "Running… this can take up to a minute" : "Run now"}
      </button>
      {error && (
        <p role="alert" className="max-w-sm text-right text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
