import type { Metadata } from "next";
import { getViewer } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/rbac";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { Notice } from "@/components/ui/Notice";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · KHOJO PAPERS" }, robots: { index: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/admin");
  if (!isStaff(viewer)) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <Notice tone="warning" title="You don't have access to the admin area">
          It&apos;s for teacher reviewers, content editors and administrators. An administrator can grant a role.
        </Notice>
      </div>
    );
  }
  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <p className="mb-2 hidden text-xs font-semibold uppercase tracking-wide text-ink-3 lg:block">Academic admin</p>
        <AdminNav roles={viewer.roles} />
        <p className="mt-3 hidden text-xs text-ink-3 lg:block">Signed in as {viewer.roles.filter((r) => r !== "student").join(", ").replace(/_/g, " ")}</p>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
