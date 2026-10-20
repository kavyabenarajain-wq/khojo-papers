# KHOJO PAPERS

**Every ICSE answer, checked. Every explanation, drawn.**

A mobile-first ICSE Class 10 exam-preparation platform. Students can:

- find exam-style questions
- answer them
- watch worked solutions unfold step by step on a whiteboard
- get written answers marked criterion by criterion against an approved rubric

The first and only supported subject is **ICSE Class 10 Mathematics**.

> **Status:** the application is built and tested. Before it can go live it needs three things that cannot be done in code:
>
> - Supabase and Azure OpenAI credentials
> - a teacher to review the seeded questions
> - a legal review of the consent design
>
> See [Status against the specification](#status-against-the-specification).

---

## Quick start

### 1. Supabase

1. Create a Supabase project (an India region is recommended for student data).
2. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY` (server only)
   - `DATABASE_URL`: the **transaction pooler** string, port 6543
   - `DIRECT_DATABASE_URL`: the **session/direct** string, port 5432, used only for migrations
3. In **Authentication → URL Configuration**:
   - set **Site URL** to your `APP_URL`
   - add `APP_URL/auth/confirm` to the redirect URLs
4. In **Authentication → Email Templates**, make the links work on any device (recommended):
   - **Confirm signup:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/`
   - **Reset password:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
   - The default `{{ .ConfirmationURL }}` links also work, but only in the browser that started the flow.
5. Configure **custom SMTP** for Supabase Auth before launch. The built-in sender is heavily rate-limited.

```bash
npm install
npm run db:migrate        # creates the app schema, RLS policies and triggers
npm run setup:storage     # creates the private answer-images and source-documents buckets
npm run db:seed           # syllabus (unverified), 42 original practice questions as drafts, 2 practice sets
npm run dev
```

Then:

1. Sign up in the app.
2. Make yourself an administrator: `npm run user:roles -- you@example.com admin teacher_reviewer content_editor`.
3. Open **/admin/review**.

Nothing is visible to students until a reviewer approves a question, its solution and its rubric, and then publishes it. Use **/admin/preview** to see drafts in the student pages.

> Authors can't approve their own revisions, and approvals are recorded under the reviewer's name. Students see the approval as "reviewed by a teacher". Have a qualified teacher do the reviewing.

### 2. Azure OpenAI (AI Examiner, OCR, AI drafting)

Set these variables:

- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_DEPLOYMENT`: a vision-capable GPT deployment, e.g. GPT-4.1 or GPT-4o
- `AZURE_OPENAI_API_VERSION`: `2024-10-21` or later, which supports structured outputs
- `AZURE_OPENAI_VISION_DEPLOYMENT` (optional): a separate deployment for reading handwriting
- `AZURE_OPENAI_REASONING_MODEL=true`: set this for o-series or GPT-5 deployments

Without these variables, every AI feature shows an honest "not configured" state. Students can still mark themselves against the rubric.

### 3. Email for guardian consent (Resend)

Set `RESEND_API_KEY` and `MAIL_FROM`. In development without a key, consent links are printed to the server console. In production without a key, consent requests are shown as unavailable.

### 4. Daily retention job

Set `CRON_SECRET`, at least 16 characters. `vercel.json` schedules `GET /api/cron/purge` daily, or you can run `npm run purge`. The job deletes:

- accounts still waiting for guardian consent after 7 days
- withdrawn accounts
- AI logs older than `AI_RUN_RETENTION_DAYS`
- uploaded photos that were never used

### Trying it without Supabase

```bash
npm run local-db -- --fake-review     # real Postgres (PGlite) on 127.0.0.1:54329, migrated and seeded
DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres npm run dev
```

All public pages work this way: Explore, questions, whiteboard, papers, About and Privacy. Sign-in still needs Supabase.

> `--fake-review` approves everything as "Local test reviewer (not a teacher)" purely so the student pages can be exercised. Never use it on real data.

---

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Unit and integration tests (Vitest, real Postgres via PGlite with the production migrations and RLS) |
| `npm run test:e2e` | Browser tests (Playwright) at 320, 375, 390, 430, 768 and 1280px against the local database |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm run check-content` | Validates every seed question: schema, KaTeX, diagrams at every step, mark totals, answer keys, duplicates |
| `npm run db:generate` | Generate a migration from schema changes (review the SQL) |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Load the syllabus, seed questions and practice sets (additive; never overwrites) |
| `npm run setup:storage` | Create the private storage buckets |
| `npm run user:roles -- <email> <roles…>` | Grant staff roles |
| `npm run purge` | Run the retention job |
| `npm run local-db [-- --fake-review]` | Throwaway local Postgres for development |

---

## Architecture

- **Next.js 16** (App Router), React 19, TypeScript and Tailwind v4.
  - Every page renders per request.
  - Small accessible UI primitives: native `<dialog>`, ARIA tabs, form controls.
- **Supabase** handles Auth (email and password, confirmation, recovery), Postgres, and private Storage.
- **Data access:** Drizzle ORM over `postgres`.
  - All app tables live in the `app` schema, which Supabase's browser-facing Data API doesn't expose.
  - Student and staff queries run inside `runAs(user)`. That sets `role authenticated` and the JWT claims, so **Postgres RLS enforces access** even if app code has a bug.
  - Only system jobs (deterministic and AI marking writes, retention) use the owner connection, with explicit ownership checks.
- **Integrity in the database:**
  - Approved revisions are immutable.
  - Approval requires a reviewer who isn't the author.
  - Rubric criteria must add up to the question's marks.
  - Publishing requires an approved question and solution, cleared rights (`own_content`/`licensed`), and a source document for official questions.
  - Submitted answers are locked.
  - Evaluations and audit entries are append-only.
- **Versioning:** questions, solutions and rubrics each have immutable revisions. Every answer is pinned to the exact question and rubric revisions it was marked against.
- **Maths and diagrams:**
  - KaTeX renders on the server with MathML for screen readers.
  - Diagrams use a declarative spec rendered to SVG and are drawn progressively on the whiteboard, each with a text description.
- **AI (Azure OpenAI, behind a provider interface):**
  - Every output is validated against a schema.
  - The server checks invariants before showing anything (every criterion scored once, marks in range, quoted evidence actually present in the answer, no marks for injected instructions).
  - Each call gets one corrective retry; a failed result is never shown as a score.
  - Every call is logged in `ai_runs`.
  - Prompts are versioned in `src/lib/ai/prompts`.

```
src/app/            pages, server actions, route handlers (admin/, api/, examiner/, papers/, questions/ …)
src/lib/db/         schema, RLS helper, client
src/lib/dal/        data access (library, questions, practice, papers, progress, review, editor, account, admin)
src/lib/ai/         provider, Azure adapter, examiner pipeline, generator, benchmarks, prompts
src/lib/grading/    deterministic marking, AI invariants, paper totals, agreement metrics
src/lib/content/    content types, rich text/KaTeX, content checks, seed loader, arithmetic checker
src/lib/ingest/     PDF text extraction, page rendering, question-boundary detection, import runner
supabase/migrations generated schema + hand-written security migration
content/seed/       syllabus, original practice questions, practice sets, authoring brief
tests/              unit, integration (PGlite), e2e (Playwright), AI fixtures
```

---

## Testing

- **Unit and integration (`npm test`, 123 tests).** These run against real Postgres (PGlite) with the production migrations and RLS policies, plus stubs for Supabase's `auth.uid()` and roles. They cover:
  - RLS isolation between students, anonymous visitors and staff roles; role escalation blocked
  - immutability, independent approval, rights-gated publishing, unpublishing, audit trail
  - search, filters, pagination, facets; answer keys absent from student data
  - deterministic marking (Indian number grouping, fractions, units), any-N paper totals, exam deadlines
  - examiner pipeline with recorded AI fixtures: valid, over-maximum, fabricated evidence, malformed, uncertain, unsuitable rubric, prompt injection, refusal, provider errors, unreadable handwriting
  - consent tokens, cascade deletion, data export, progress metrics
  - benchmarks and agreement metrics, PDF ingestion, AI question drafting, image processing (EXIF stripped, orientation, HEIC rejected)
- **Browser tests (`npm run test:e2e`, 13 tests):**
  - no horizontal overflow and no console errors on 15 pages at six widths
  - touch targets of at least 44px on phones
  - search and filter drawer
  - answering a multiple-choice question
  - revealing a solution and stepping through the whiteboard
  - honest signed-out states
- **Not yet exercised in a browser:**
  - flows that need a real Supabase project: sign-up, login, consent emails, saved practice, exam mode, uploads, admin pages
  - live Azure OpenAI calls

  Their logic is covered by the integration tests. Walk these flows once credentials are added.

---

## Status against the specification

### Implemented and verified by automated tests
- Data model with provenance, permission status, versioning and audit; RLS on every table.
- Question library: full-text search, combined filters (class/subject fixed to what exists, syllabus year, chapter, topic, source, exam year, marks, difficulty, format, attempted or not, bookmarked) and pagination.
- Three distinct source labels: board paper, specimen paper, and KHOJO original.
- A solve page with inputs for each format: MCQ, numerical with unit, working, short and long answers, and structured parts.
- Answering on the solve page: attempt-before-reveal, hints, deterministic marking, a self-assessment rubric, report an issue, bookmarks, and debounced autosave (account or device).
- Whiteboard: progressive steps, KaTeX, progressive SVG diagrams, and prev/next/restart/show all/hide/play/replay controls. It also has keyboard navigation, live announcements, a text view, and respects reduced motion.
- Papers: structure, a reader view, timed exam mode (server deadline, navigator, autosave with retry, auto-submit, over-attempt warnings), results, and revisiting mistakes.
- AI Examiner pipeline (stages 1–6), uncertainty handling, teacher-review requests, the results page, and daily AI quotas.
- Progress: only real data, kept separate by marking method, with thresholds before naming weak chapters or trends, and no "exam-ready" label.
- Admin and review:
  - queue, side-by-side review, automated checks, JSON editors with maths preview
  - topic mapping, publish/unpublish, rights flags
  - revision history with diffs, issue reports, audit log, roles, syllabus verification
- Teacher re-marking, AI-vs-teacher comparison, and benchmarks with criterion-level metrics.
- PDF import: text layer, OCR via AI when configured, boundary and marks detection, candidates with confidence, side-by-side original page, creating drafts.
- AI-assisted original question drafting with arithmetic re-checking, the reference-to-exam-year check, duplicate detection, and AI-drafted labelling.
- Accounts: guardian-first consent flow, settings and accessibility preferences, history, data export, account deletion, and retention jobs.
- Security headers and a production CSP, Origin checks on route handlers, rate limits in Postgres, and private uploads served only after an access check.

### Partially done
- **Seed content.** 42 original practice questions (16 show-working, 11 MCQ, 8 structured, 7 numerical) across 20 chapters.
  - Each was written with AI assistance and independently re-solved by a second pass.
  - They pass all automated checks, and their reviewer notes are attached.
  - **None has been reviewed by a teacher.** The Constructions and Loci chapters have no questions yet.
- **Syllabus mapping.** Chapter and topic names come from the build team's knowledge, because cisce.org blocked automated retrieval (HTTP 403). All are marked unverified until checked against the official PDF in **/admin/syllabus**.
- **Question editing.** It uses structured JSON editors with validation and a maths preview, not a visual form for every field.

### Missing (sensible next steps)
- A visual diagram editor (diagrams are edited as JSON specs).
- Dedicated parent and teacher dashboards. Parents currently interact only through consent and withdrawal.
- Diagram- and map-answer formats (a student drawing as the answer). The question formats exist, but only photos are assessed, and only on described features.
- Class 9 and other subjects (deliberately out of scope until Mathematics meets the quality bar).

### Blocked by configuration, content rights or people
- Supabase project credentials, Azure OpenAI credentials, Resend, and custom SMTP for Supabase Auth.
- **Rights to host official CISCE papers.** No official question is included. The import pipeline accepts a stored copy only when rights are marked licensed or our own.
- **A qualified ICSE teacher** to:
  - review and approve the seeded content
  - verify the syllabus mapping
  - mark a representative benchmark set (correct, partial, alternative methods, misconceptions, illegible and so on) before any AI accuracy claim is made
- **Legal review** of the under-18 consent design against the DPDP Act 2023 and its Rules. The current email-link consent is an interim mechanism and is labelled as such.
