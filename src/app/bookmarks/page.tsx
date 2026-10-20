import type { Metadata } from "next";
import { Bookmark } from "lucide-react";
import { requireViewer } from "@/lib/auth/rbac";
import { asViewer } from "@/lib/dal/context";
import { searchQuestions } from "@/lib/dal/library";
import { QuestionCard } from "@/components/question/QuestionCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Bookmarks" };

export default async function BookmarksPage() {
  await requireViewer("/bookmarks");
  const result = await asViewer((tx, ctx) => searchQuestions(tx, { bookmarked: true }, { userId: ctx.userId, preview: false, pageSize: 100 }));
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Bookmarks</h1>
      {result.items.length ? (
        <ul className="mt-6 space-y-3">
          {result.items.map((q) => (
            <li key={q.id}><QuestionCard q={q} /></li>
          ))}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState icon={<Bookmark className="size-5" />} title="No bookmarks yet" action={<ButtonLink href="/explore">Explore questions</ButtonLink>}>
            Use the Bookmark button on any question to save it here.
          </EmptyState>
        </div>
      )}
    </div>
  );
}
