"use client";

import { setActingAs } from "@/app/actions";
import { ACTORS, type Actor } from "@/lib/approval/decide";

export function ActingAsSelect({ current }: { current: Actor }) {
  return (
    <form action={setActingAs} className="flex items-center gap-2 text-sm">
      <label htmlFor="actor" className="text-slate-600">
        Acting as
      </label>
      <select
        id="actor"
        name="actor"
        defaultValue={current}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-slate-300 bg-white px-2 py-1"
      >
        {ACTORS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </form>
  );
}
