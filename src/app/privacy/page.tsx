import type { Metadata } from "next";
import { AI_PROCESSING, DATA_WE_COLLECT, PRIVACY_POLICY_VERSION, WE_DO_NOT, YOUR_CHOICES } from "@/lib/policies";

export const metadata: Metadata = { title: "Privacy" };

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="prose-body mx-auto max-w-2xl px-4 py-8 text-ink-2">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Privacy</h1>
      <p className="mt-4">
        Many of our users are under 18, so we collect as little as we can and ask a parent or guardian for consent before saving a younger student&apos;s work.
        You can browse and practise without an account.
      </p>
      <Section title="What we collect when you create an account" items={DATA_WE_COLLECT} />
      <Section title="AI marking" items={AI_PROCESSING} />
      <Section title="What we don't do" items={WE_DO_NOT} />
      <Section title="Your choices" items={YOUR_CHOICES} />
      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Who can see your work</h2>
        <p className="mt-3">
          Only you. If you ask a teacher to check a mark, or the AI Examiner flags an answer as uncertain, a teacher reviewer can see that one answer
          (and its photo) to re-mark it; that access is logged. Content editors never see student answers.
        </p>
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Retention</h2>
        <p className="mt-3">
          Your answers and marks are kept until you delete them or your account. Accounts waiting for guardian consent are deleted automatically if consent
          isn&apos;t given within a week. AI request logs (without photos) are deleted after a fixed period.
        </p>
      </section>
      <p className="mt-8 text-sm text-ink-3">Notice version {PRIVACY_POLICY_VERSION}. This notice has not yet been reviewed by a lawyer and will be updated after legal review.</p>
    </div>
  );
}
