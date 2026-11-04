import type { ReactNode } from "react";
import { formatRun, nextScheduledRun } from "@/lib/ingest/schedule";
import { getActingAs } from "@/lib/session";
import { getMonitorView, getWarehouse } from "@/lib/shell-data";
import { Banners } from "./banners";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

/** The frame around every page: dark sidebar, top bar, and the system-wide warnings. */
export async function AppShell({ children }: { children: ReactNode }) {
  const [monitor, warehouse, actor] = await Promise.all([getMonitorView(), getWarehouse(), getActingAs()]);

  return (
    <div className="lg:pl-[236px]">
      <Sidebar nextRun={formatRun(nextScheduledRun(new Date()))} overviewLabel={actor === "Deepa" ? "Oversight" : "Reorder desk"} />
      <div className="mx-auto max-w-[1380px] px-4 pb-20 sm:px-8 lg:pr-8">
        <TopBar warehouse={warehouse} />
        {monitor && <Banners monitor={monitor} />}
        {children}
      </div>
    </div>
  );
}
