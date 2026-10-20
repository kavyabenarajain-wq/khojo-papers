import Link from "next/link";
import { Bookmark, CheckCircle2, CircleDashed, PenLine, XCircle } from "lucide-react";
import type { QuestionCardDTO } from "@/lib/dal/library";
import { parseRichText, renderInline } from "@/lib/content/richtext";
import { DIFFICULTY_LABELS, FORMAT_LABELS, marksLabel } from "@/lib/labels";
import { Badge } from "@/components/ui/Badge";
import { SourceBadge } from "./SourceBadge";

/** First paragraph of the stem, rendered with maths, for previews. */
function previewHtml(stem: string): string {
  const first = parseRichText(stem).find((b) => b.t === "p");
  if (!first) return renderInline(stem.slice(0, 200));
  const text = stem.split(/\n\s*\n/)[0];
  return renderInline(text);
}

const STATUS = {
  correct: { icon: CheckCircle2, label: "Answered correctly", className: "text-success" },
  incorrect: { icon: XCircle, label: "Answered incorrectly", className: "text-danger" },
  attempted: { icon: PenLine, label: "Attempted", className: "text-ink-2" },
  in_progress: { icon: CircleDashed, label: "Draft saved", className: "text-ink-3" },
} as const;

export function QuestionCard({ q }: { q: QuestionCardDTO }) {
  const status = q.attemptStatus ? STATUS[q.attemptStatus] : null;
  return (
    <article className="relative rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <SourceBadge source={q.sourceType} year={q.examYear} />
        {q.marks != null && <Badge>{marksLabel(q.marks)}</Badge>}
        {q.answerFormat && <Badge>{FORMAT_LABELS[q.answerFormat]}</Badge>}
        {q.difficulty && q.difficultyValidated && <Badge>{DIFFICULTY_LABELS[q.difficulty]}</Badge>}
        {q.publicationStatus !== "published" && <Badge tone="warning">Unpublished · preview</Badge>}
      </div>
      <h3 className="text-[0.95rem] leading-normal">
        <Link href={`/questions/${q.id}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
          <span className="sr-only">Question {q.code}: </span>
          <span className="prose-question line-clamp-3 block text-ink" dangerouslySetInnerHTML={{ __html: previewHtml(q.stem) }} />
        </Link>
      </h3>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
        {q.chapterName && <span>{q.chapterName}</span>}
        {q.paperTitle && <span>{q.paperTitle}</span>}
        <span className="font-mono text-xs">{q.code}</span>
        {q.hasSolution && <span>Worked solution</span>}
        {q.hasRubric && <span>Marking rubric</span>}
        <span className="ml-auto flex items-center gap-2">
          {q.bookmarked && (
            <span className="inline-flex items-center gap-1 text-ink-2">
              <Bookmark className="size-4 fill-current" aria-hidden />
              <span className="sr-only">Bookmarked</span>
            </span>
          )}
          {status && (
            <span className={`inline-flex items-center gap-1 ${status.className}`}>
              <status.icon className="size-4" aria-hidden />
              {status.label}
            </span>
          )}
        </span>
      </div>
    </article>
  );
}
