import type { QuestionContent } from "@/lib/content/types";
import { Rich } from "@/components/ui/Rich";
import { Diagram } from "@/components/diagram/Diagram";
import { renderInline } from "@/lib/content/richtext";

/** The question as set: instructions, passage, data table, stem and figures (no answers). */
export function QuestionBody({ content }: { content: QuestionContent }) {
  return (
    <div className="space-y-4">
      {content.instructions && <p className="text-sm italic text-ink-2">{content.instructions}</p>}
      {content.passage && (
        <div className="rounded-md border-l-4 border-line-strong bg-surface-2 px-4 py-3">
          <Rich source={content.passage} variant="question" />
        </div>
      )}
      <Rich source={content.stem} variant="question" className="text-ink" />
      {content.table && (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-max border-collapse text-[0.95rem]">
            {content.table.caption && <caption className="mb-2 text-left text-sm text-ink-2">{content.table.caption}</caption>}
            <thead>
              <tr>
                {content.table.headers.map((h, i) => (
                  <th key={i} scope="col" className="border border-line bg-surface-2 px-3 py-2 text-left font-semibold" dangerouslySetInnerHTML={{ __html: renderInline(h) }} />
                ))}
              </tr>
            </thead>
            <tbody>
              {content.table.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="border border-line px-3 py-2 tabular-nums" dangerouslySetInnerHTML={{ __html: renderInline(cell) }} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {content.diagrams?.map((d) => (
        <div key={d.id}>
          <Diagram diagram={d} visibleStep={0} />
          <details className="mt-1 text-sm text-ink-3">
            <summary className="min-h-9 cursor-pointer py-1">Text description of the figure</summary>
            <p className="mt-1">{d.alt}</p>
          </details>
        </div>
      ))}
    </div>
  );
}
