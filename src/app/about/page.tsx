import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { rows } from "@/lib/db/query";
import { integrations } from "@/lib/env";

export const metadata: Metadata = { title: "How we check content" };

export default async function AboutPage() {
  const stats = integrations.database
    ? (
        await rows<{ published: number; official: number; topics: number; topics_verified: number; teacher_benchmarks: number }>(
          getDb(),
          sql`select (select count(*)::int from app.questions where publication_status = 'published') as published,
                     (select count(*)::int from app.questions where publication_status = 'published' and source_type <> 'original_practice') as official,
                     (select count(*)::int from app.syllabus_topics) as topics,
                     (select count(*)::int from app.syllabus_topics where verification_status = 'verified') as topics_verified,
                     (select count(*)::int from app.examiner_benchmarks) as teacher_benchmarks`,
        )
      )[0]
    : null;
  return (
    <div className="prose-body mx-auto max-w-2xl px-4 py-8 text-ink-2">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">How we check content</h1>
      <p className="mt-4">KHOJO PAPERS is an independent study tool for ICSE Class 10. It is not affiliated with, or endorsed by, CISCE. This page explains where our questions come from and what our checks do and don&apos;t mean.</p>

      <h2 className="mt-8 text-xl font-semibold text-ink">Where questions come from</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li><strong className="text-ink">Board paper</strong> and <strong className="text-ink">Specimen paper</strong> questions are from official CISCE documents. We show them only when we have the right to, and always with their source, year and page.</li>
        <li><strong className="text-ink">KHOJO original</strong> questions are written for practice. Some are drafted with AI assistance. They are never presented as having appeared in an examination.</li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold text-ink">What &ldquo;reviewed by a teacher&rdquo; means</h2>
      <p className="mt-3">
        A question is published only after a teacher reviewer has checked the question, its worked solution and, where there is one, its marking rubric, and
        approved each one under their own name. Approved versions are never edited: corrections become a new version that is reviewed again, and any
        mark you received stays linked to the version you answered.
      </p>
      <p className="mt-3">Automatic checks also run before review (maths renders correctly, marks add up, answer keys match the options). They catch formatting mistakes, not mathematical ones.</p>

      <h2 className="mt-8 text-xl font-semibold text-ink">How answers are marked</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li><strong className="text-ink">Checked against the answer key:</strong> multiple-choice and numerical answers.</li>
        <li><strong className="text-ink">AI-estimated:</strong> the AI Examiner marks written answers against the approved rubric, criterion by criterion, quoting your work as evidence. If it can&apos;t read your handwriting or isn&apos;t sure, it says so instead of guessing.</li>
        <li><strong className="text-ink">Self-assessed:</strong> you mark yourself against the rubric.</li>
        <li><strong className="text-ink">Teacher-marked:</strong> a teacher re-marks an answer you asked them to check.</li>
      </ul>
      <p className="mt-3">Rubrics are written for practice and are not official CISCE marking schemes. AI marks may differ from board marking. We measure how closely the AI agrees with teachers on a set of teacher-marked answers before making any accuracy claims, and we haven&apos;t published any yet.</p>

      <h2 className="mt-8 text-xl font-semibold text-ink">Current status</h2>
      {stats ? (
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>{stats.published} published questions ({stats.official} from official papers).</li>
          <li>Syllabus mapping: {stats.topics_verified} of {stats.topics} chapters and topics verified against the official CISCE syllabus document so far.</li>
          <li>{stats.teacher_benchmarks} teacher-marked answers in the AI Examiner benchmark set.</li>
        </ul>
      ) : (
        <p className="mt-3">Not available on this server.</p>
      )}

      <p className="mt-8">Spotted a mistake? Use <strong className="text-ink">Report an issue</strong> on any question. See also our <Link href="/privacy" className="font-medium text-accent-text underline">privacy notice</Link>.</p>
    </div>
  );
}
