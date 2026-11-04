"use client";

import { usePathname, useSearchParams } from "next/navigation";

/** Filters the Overview table by SKU code or name. Plain GET form, so it works without scripts and can be bookmarked. */
export function SearchBox() {
  const pathname = usePathname();
  const params = useSearchParams();
  if (pathname !== "/") return <div className="flex-1" />;

  return (
    <form action="/" method="get" role="search" className="relative flex-1 sm:max-w-md">
      {params.get("show") && <input type="hidden" name="show" value={params.get("show") ?? ""} />}
      <svg className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        key={params.get("q") ?? ""}
        type="search"
        name="q"
        defaultValue={params.get("q") ?? ""}
        placeholder="Search by SKU code or product"
        aria-label="Search SKUs"
        className="w-full rounded-full border-0 bg-mint py-2.5 pl-11 pr-4 text-[14px] placeholder:text-ink-soft focus:outline-2 focus:outline-forest"
      />
    </form>
  );
}
