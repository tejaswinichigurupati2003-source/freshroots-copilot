import type { Metadata } from "next";
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
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[32px] sm:text-[38px]">Audit log</h1>
        <p className="mt-1.5 text-ink-soft">Every decision and system action, newest first.</p>
      </div>
      {"error" in result ? (
        <p role="alert" className="rounded-2xl bg-tomato-wash p-4 text-sm">
          <span className="font-semibold">Could not load the audit log.</span> <span className="num text-xs text-ink-soft">{result.error}</span>
        </p>
      ) : (
        <section className="card overflow-x-auto p-5">
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
                  <td className="num whitespace-nowrap !py-3 text-[13px] text-ink-soft">{when(row.at)}</td>
                  <td className="!py-3 font-semibold">{row.actor}</td>
                  <td className="!py-3">{words(row.action)}</td>
                  <td className="num !py-3 text-[12px] leading-snug text-ink-soft">{Object.keys(row.details).length ? JSON.stringify(row.details) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
