import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { UpdatePasswordForm } from "@/components/auth/forms";
import { requireViewer } from "@/lib/auth/rbac";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function UpdatePasswordPage() {
  await requireViewer("/account/update-password");
  return (
    <AuthShell title="Choose a new password">
      <UpdatePasswordForm />
    </AuthShell>
  );
}
