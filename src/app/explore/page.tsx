import type { Metadata } from "next";
import { Suspense } from "react";
import { BookOpen } from "lucide-react";
import { asViewer } from "@/lib/dal/context";
import { libraryFacets, searchQuestions } from "@/lib/dal/library";
import { parseLibraryParams } from "@/lib/dal/filters";
import { integrations } from "@/lib/env";
import { QuestionCard } from "@/components/question/QuestionCard";
import { LibraryFilters } from "@/components/library/LibraryFilters";
import { SearchBox } from "@/components/library/SearchBox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { DatabaseUnavailable } from "@/components/ui/Unavailable";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Explore questions" };

export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  const params = await searchParams;
  if (!integrations.database) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-semibold">Explore questions</h1>
        <DatabaseUnavailable />
      </div>
    );
  }
  const { filters, page } = parseLibraryParams(params);
  const { result, facets, signedIn } = await asViewer(async (tx, ctx) => ({
    result: await searchQuestions(tx, filters, { userId: ctx.userId, preview: ctx.preview, page }),
    facets: await libraryFacets(tx, { preview: ctx.preview }),
    signedIn: Boolean(ctx.userId),
  }));

  const pageHref = (p: number) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (typeof v === "string" && k !== "page") next.set(k, v);
    if (p > 1) next.set("page", String(p));
    return `/explore${next.size ? `?${next}` : ""}`;
  };
  const filtered = Object.keys(params).some((k) => k !== "page");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Explore questions</h1>
        <p className="mt-1 text-ink-2">ICSE Class 10 Mathematics. Every question shows where it comes from.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Suspense>
          <LibraryFilters facets={facets} signedIn={signedIn} />
        </Suspense>
        <section aria-labelledby="results-heading" className="min-w-0 space-y-4">
          <Suspense>
            <SearchBox />
          </Suspense>
          <h2 id="results-heading" className="text-sm text-ink-3" aria-live="polite">
            {result.total === 1 ? "1 question" : `${result.total} questions`}
            {filters.q ? ` matching “${filters.q}”` : ""}
          </h2>
          {result.items.length ? (
            <ul className="space-y-3">
              {result.items.map((q) => (
                <li key={q.id}>
                  <QuestionCard q={q} />
                </li>
              ))}
            </ul>
          ) : filtered ? (
            <EmptyState icon={<BookOpen className="size-5" />} title="No questions match these filters" action={<ButtonLink href="/explore" variant="secondary">Clear filters</ButtonLink>}>
              Try removing a filter or searching for a different term.
            </EmptyState>
          ) : (
            <EmptyState icon={<BookOpen className="size-5" />} title="No questions have been published yet">
              Questions appear here once a teacher has reviewed the question, its worked solution and its marking rubric.
            </EmptyState>
          )}
          <Pagination page={result.page} pageCount={result.pageCount} href={pageHref} />
        </section>
      </div>
    </div>
  );
}
