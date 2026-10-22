import { NavLinks } from "@/components/banners";
import { getDb } from "@/lib/db/client";

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
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <NavLinks current="audit" />
      </header>
      {"error" in result ? (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Could not load the audit log: {result.error}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">When (IST)</th>
                <th className="px-3 py-2 font-medium">Who</th>
                <th className="px-3 py-2 font-medium">What</th>
                <th className="px-3 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-200 align-top">
                  <td className="whitespace-nowrap px-3 py-2">{when(row.at)}</td>
                  <td className="px-3 py-2">{row.actor}</td>
                  <td className="px-3 py-2 font-medium">{row.action}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">{JSON.stringify(row.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
