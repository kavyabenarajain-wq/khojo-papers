import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireViewer } from "@/lib/auth/rbac";
import { signOutAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const v = await requireViewer("/account");
  const links = [
    { href: "/account/history", title: "Attempt history", body: "Every answer you've submitted and how it was marked." },
    { href: "/bookmarks", title: "Bookmarks", body: "Questions you saved for later." },
    { href: "/account/settings", title: "Settings and accessibility", body: "Name, text size, motion and contrast." },
    { href: "/account/privacy", title: "Privacy and your data", body: "Download your data or delete your account." },
    ...(v.ageBracket === "under_18" ? [{ href: "/account/consent", title: "Parent or guardian consent", body: `Status: ${v.consentStatus === "granted" ? "given" : v.consentStatus}` }] : []),
    { href: "/account/update-password", title: "Change password", body: "" },
  ];
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>
      <p className="mt-1 text-ink-2">{v.email}</p>
      <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
              <span>
                <span className="block font-medium">{l.title}</span>
                {l.body && <span className="text-sm text-ink-3">{l.body}</span>}
              </span>
              <ChevronRight className="size-4 text-ink-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <form action={signOutAction} className="mt-6">
        <Button type="submit" variant="secondary">Sign out</Button>
      </form>
    </div>
  );
}
