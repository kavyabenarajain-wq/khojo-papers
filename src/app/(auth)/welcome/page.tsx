import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { WelcomeForm } from "@/components/auth/forms";
import { getViewer } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/request";

export const metadata: Metadata = { title: "Finish setting up" };

export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const { next } = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const nextPath = safeNextPath(typeof next === "string" ? next : null, "/");
  if (!viewer.needsProfile) redirect(nextPath);
  return (
    <AuthShell title="One more step" intro="We need to know whether you're under 18 so we can ask a parent or guardian for consent where required.">
      <WelcomeForm next={nextPath} />
    </AuthShell>
  );
}
