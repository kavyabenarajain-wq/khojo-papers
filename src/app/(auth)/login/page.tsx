import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/forms";
import { getViewer } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/request";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : null, "/");
  if (await getViewer()) redirect(nextPath);
  return (
    <AuthShell
      title="Sign in"
      intro={error === "link" ? <span className="text-danger">That link has expired or was already used. Sign in, or request a new link.</span> : "Save your answers, track progress and use the AI Examiner."}
      footer={<>New here? <Link href={`/signup?next=${encodeURIComponent(nextPath)}`} className="font-medium text-accent-text hover:underline">Create an account</Link></>}
    >
      <LoginForm next={nextPath} />
    </AuthShell>
  );
}
