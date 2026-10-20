import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { asViewer } from "@/lib/dal/context";
import * as s from "@/lib/db/schema";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage() {
  const list = await asViewer((tx) => tx.select().from(s.auditLog).orderBy(desc(s.auditLog.createdAt)).limit(300));
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
      <p className="mt-1 text-ink-2">Consequential changes: reviews, publishing, rights changes, roles and staff access to student uploads. Entries can&apos;t be edited.</p>
      {list.length === 0 ? <p className="mt-6 text-ink-3">No entries yet (or you are not an administrator).</p> : (
        <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface-2 text-left text-ink-2"><tr>{["When", "Actor", "Action", "Entity", "Details"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line align-top">
              {list.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap px-3 py-2">{a.createdAt.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-2 font-mono text-xs">{a.actorId?.slice(0, 8) ?? "system"}</td>
                  <td className="px-3 py-2">{a.action}</td>
                  <td className="px-3 py-2 font-mono text-xs">{a.entityType}:{a.entityId?.slice(0, 8)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{JSON.stringify(a.details).slice(0, 160)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
