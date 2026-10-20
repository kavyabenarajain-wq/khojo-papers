import { renderInline, renderRichText } from "@/lib/content/richtext";
import { cn } from "@/lib/cn";

/** Server-rendered rich text with maths. `variant` picks question (serif) or body typography. */
export function Rich({ source, variant = "body", className, inline }: { source?: string | null; variant?: "question" | "body"; className?: string; inline?: boolean }) {
  if (!source) return null;
  const html = inline ? renderInline(source) : renderRichText(source);
  const Tag = inline ? "span" : "div";
  return <Tag className={cn(variant === "question" ? "prose-question" : "prose-body", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
