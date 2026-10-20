import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignUpForm } from "@/components/auth/forms";
import { getViewer } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/request";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : null, "/");
  if (await getViewer()) redirect(nextPath);
  return (
    <AuthShell
      title="Create an account"
      intro="Free. You don't need an account to browse and practise; you need one to save your work."
      footer={<>Already have an account? <Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="font-medium text-accent-text hover:underline">Sign in</Link></>}
    >
      <SignUpForm next={nextPath} />
    </AuthShell>
  );
}
