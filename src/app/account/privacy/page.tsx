import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { requireViewer } from "@/lib/auth/rbac";
import { DeleteAccountForm } from "@/components/auth/AccountForms";
import { buttonClass } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Privacy and your data" };

export default async function PrivacyControlsPage() {
  const v = await requireViewer("/account/privacy");
  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy and your data</h1>
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="font-semibold">Download your data</h2>
        <p className="mt-1 text-[0.95rem] text-ink-2">A file with your profile, answers, marks, feedback, bookmarks and consent records.</p>
        <a href="/api/account/export" className={buttonClass("secondary", "md", "mt-3")} download>
          <Download className="size-4" aria-hidden /> Download my data
        </a>
      </section>
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="font-semibold">What we keep</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.95rem] text-ink-2">
          <li>Your answers and marks, until you delete them.</li>
          <li>Photos of handwritten answers, privately stored and visible only to you (and a teacher, if you ask for a review).</li>
          <li>AI request logs without photos, deleted automatically after a fixed period.</li>
        </ul>
        <p className="mt-2 text-sm"><Link href="/privacy" className="font-medium text-accent-text underline">Read the full privacy notice</Link></p>
      </section>
      <section className="rounded-lg border border-danger/30 bg-surface p-5">
        <h2 className="font-semibold text-danger">Delete your account</h2>
        <p className="mt-1 text-[0.95rem] text-ink-2">
          Permanently deletes your account, answers, uploaded photos, marks and bookmarks. This can&apos;t be undone.
          {v.ageBracket === "under_18" && " Your parent or guardian can also do this using the link in their confirmation email."}
        </p>
        <div className="mt-4">
          <DeleteAccountForm />
        </div>
      </section>
    </div>
  );
}
