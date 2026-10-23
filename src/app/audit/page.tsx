import type { Metadata } from "next";
import { Masthead } from "@/components/banners";
import { getDb } from "@/lib/db/client";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

interface AuditRow {
  id: number;
  at: string;
  actor: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium" });

/** Reads as a sentence: "decision approved" instead of decision_approved. */
const words = (action: string) => action.replace(/_/g, " ");

async function loadAudit(): Promise<{ rows: AuditRow[] } | { error: string }> {
  try {
    return { rows: await getDb().query<AuditRow>("select id, at, actor, action, entity, entity_id, details from audit_log order by id desc limit 200") };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function AuditPage() {
  const result = await loadAudit();

  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-7 px-5 pb-20 pt-5 sm:px-8">
      <Masthead current="audit" />
      <div>
        <p className="eyebrow">Every decision and system action, newest first</p>
        <h1 className="mt-1 text-[40px] sm:text-[46px]">Audit log</h1>
      </div>
      {"error" in result ? (
        <p role="alert" className="border-l-4 border-tomato bg-tomato-wash p-4 text-sm">
          <span className="font-semibold">Could not load the audit log.</span> <span className="num text-xs text-ink-soft">{result.error}</span>
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="ledger min-w-[760px]">
            <thead>
              <tr>
                <th>When (IST)</th>
                <th>Who</th>
                <th>What</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.id}>
                  <td className="num whitespace-nowrap !py-2.5 text-[13px] text-ink-soft">{when(row.at)}</td>
                  <td className="!py-2.5 font-semibold">{row.actor}</td>
                  <td className="!py-2.5">{words(row.action)}</td>
                  <td className="num !py-2.5 text-[12px] leading-snug text-ink-soft">{Object.keys(row.details).length ? JSON.stringify(row.details) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
