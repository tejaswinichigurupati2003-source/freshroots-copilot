"use client";

import { useEffect, useState, useTransition } from "react";
import { setActingAs } from "@/app/actions";
import { ACTORS, type Actor } from "@/lib/approval/decide";

const ROLE_HINT: Record<Actor, string> = {
  Raghav: "Planner: decides lines, sends orders",
  Deepa: "Oversight: losses, kill switch, review",
};

/**
 * Not a <form action>: React 19 resets a form's fields when its action finishes, which put the dropdown back to
 * the server-rendered option while the cookie (and the page) had already switched.
 */
export function ActingAsSelect({ current }: { current: Actor }) {
  const [value, setValue] = useState<Actor>(current);
  const [pending, startTransition] = useTransition();
  useEffect(() => setValue(current), [current]);

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="actor" className="text-slate-600">
        Acting as
      </label>
      <select
        id="actor"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as Actor;
          setValue(next);
          startTransition(async () => {
            await setActingAs(next);
          });
        }}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 disabled:opacity-60"
      >
        {ACTORS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <span className="hidden text-xs text-slate-500 md:inline">{ROLE_HINT[value]}</span>
    </div>
  );
}
