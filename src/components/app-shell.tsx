import type { ReactNode } from "react";
import { formatRun, nextScheduledRun } from "@/lib/ingest/schedule";
import { getMonitorView, getWarehouse } from "@/lib/shell-data";
import { Banners } from "./banners";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

/** The frame around every page: dark sidebar, top bar, and the system-wide warnings. */
export async function AppShell({ children }: { children: ReactNode }) {
  const [monitor, warehouse] = await Promise.all([getMonitorView(), getWarehouse()]);

  return (
    <div className="lg:pl-[236px]">
      <Sidebar nextRun={formatRun(nextScheduledRun(new Date()))} />
      <div className="mx-auto max-w-[1380px] px-4 pb-20 sm:px-8 lg:pr-8">
        <TopBar warehouse={warehouse} />
        {monitor && <Banners monitor={monitor} />}
        {children}
      </div>
    </div>
  );
}
