import { cn } from "@/lib/cn";

/** Pre-rendered HTML (from renderRichText on the server) for use inside client components. */
export function RichHtml({ html, variant = "body", className, inline }: { html: string; variant?: "question" | "body"; className?: string; inline?: boolean }) {
  const Tag = inline ? "span" : "div";
  return <Tag className={cn(variant === "question" ? "prose-question" : "prose-body", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
