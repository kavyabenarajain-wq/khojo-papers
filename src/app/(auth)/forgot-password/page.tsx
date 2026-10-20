import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" intro="Enter your account email and we'll send you a link to choose a new password." footer={<Link href="/login" className="font-medium text-accent-text hover:underline">Back to sign in</Link>}>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
