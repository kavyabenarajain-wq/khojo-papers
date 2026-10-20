import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass } from "./Button";

export function Pagination({ page, pageCount, href }: { page: number; pageCount: number; href: (page: number) => string }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className={buttonClass("secondary")} rel="prev">
          <ChevronLeft className="size-4" aria-hidden /> Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-ink-3">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className={buttonClass("secondary")} rel="next">
          Next <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
