import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { rows } from "@/lib/db/query";
import { getViewer } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/rbac";
import { Notice } from "@/components/ui/Notice";
import { RolesEditor } from "@/components/admin/SmallForms";

export const metadata: Metadata = { title: "Users and roles" };

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const viewer = await getViewer();
  if (!hasRole(viewer, "admin")) return <Notice tone="warning">Only administrators can manage roles.</Notice>;
  const q = typeof (await searchParams).q === "string" ? String((await searchParams).q).trim().slice(0, 100) : "";
  // Emails live in Supabase Auth; this admin-only listing joins them in with the owner connection.
  const list = q
    ? await rows<{ id: string; email: string; roles: string[]; created_at: Date; age_bracket: string; consent_status: string }>(
        getDb(),
        sql`select p.id, u.email, p.roles, p.created_at, p.age_bracket, p.consent_status from app.profiles p join auth.users u on u.id = p.id
            where u.email ilike ${`%${q}%`} order by p.created_at desc limit 25`,
      )
    : await rows<{ id: string; email: string; roles: string[]; created_at: Date; age_bracket: string; consent_status: string }>(
        getDb(),
        sql`select p.id, u.email, p.roles, p.created_at, p.age_bracket, p.consent_status from app.profiles p join auth.users u on u.id = p.id
            where p.roles && array['teacher_reviewer','content_editor','admin'] order by p.created_at desc limit 50`,
      );
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Users and roles</h1>
      <p className="mt-1 text-ink-2">Staff are listed below. Search by email to find someone else. Students&apos; work is never shown here.</p>
      <form className="mt-4" action="/admin/users">
        <input name="q" defaultValue={q} placeholder="Search by email" aria-label="Search by email" className="min-h-10 w-full max-w-md rounded-md border border-line-strong bg-surface px-3" />
      </form>
      <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
        {list.map((u) => (
          <li key={u.id} className="space-y-2 px-4 py-3">
            <p className="font-medium">{u.email} <span className="text-sm font-normal text-ink-3">· joined {new Date(u.created_at).toLocaleDateString("en-IN")} · {u.age_bracket === "under_18" ? `under 18 (consent ${u.consent_status})` : "adult"}</span></p>
            <RolesEditor userId={u.id} roles={u.roles} />
          </li>
        ))}
      </ul>
      {list.length === 0 && <p className="mt-4 text-ink-3">No matching users.</p>}
    </div>
  );
}
