import { Suspense } from "react";
import { getActingAs } from "@/lib/session";
import { ActingAsSelect } from "./acting-as-select";
import { SearchBox } from "./search-box";

/** Where the stock is, a search box, and who is using the desk. */
export async function TopBar({ warehouse }: { warehouse: string | null }) {
  const actor = await getActingAs();

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4">
      {warehouse && (
        <span className="inline-flex items-center gap-2 rounded-full bg-lime px-4 py-2 text-[13px] font-bold text-forest-deep">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          {warehouse}
        </span>
      )}
      <Suspense fallback={<div className="flex-1" />}>
        <SearchBox />
      </Suspense>
      <div className="ml-auto">
        <ActingAsSelect current={actor} />
      </div>
    </div>
  );
}
