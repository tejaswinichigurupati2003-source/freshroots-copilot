"use client";

import { useEffect, useState, useTransition } from "react";
import { setActingAs } from "@/app/actions";
import { ACTORS, type Actor } from "@/lib/approval/decide";

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
      <label htmlFor="actor" className="eyebrow">
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
        className="field py-1 font-semibold disabled:opacity-60"
      >
        {ACTORS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </div>
  );
}
