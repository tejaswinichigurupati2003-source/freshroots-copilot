"use client";

import { useEffect, useState, useTransition } from "react";
import { setActingAs } from "@/app/actions";
import { ACTORS, type Actor } from "@/lib/approval/decide";

const FULL_NAME: Record<Actor, string> = { Raghav: "Raghav Kulkarni", Deepa: "Deepa" };
const ROLE: Record<Actor, string> = { Raghav: "Senior demand planner", Deepa: "Oversight" };

/**
 * Not a <form action>: React 19 resets a form's fields when its action finishes, which put the dropdown back to
 * the server-rendered option while the cookie (and the page) had already switched.
 */
export function ActingAsSelect({ current }: { current: Actor }) {
  const [value, setValue] = useState<Actor>(current);
  const [pending, startTransition] = useTransition();
  useEffect(() => setValue(current), [current]);

  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-forest font-display text-[17px] font-semibold text-lime" aria-hidden>
        {value[0]}
      </span>
      <div className="leading-tight">
        <label htmlFor="actor" className="block text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">
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
          className="-ml-1 cursor-pointer rounded-lg bg-transparent py-0.5 pr-1 font-display text-[16px] font-semibold text-ink disabled:opacity-60"
          title={ROLE[value]}
        >
          {ACTORS.map((a) => (
            <option key={a} value={a}>
              {FULL_NAME[a]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
